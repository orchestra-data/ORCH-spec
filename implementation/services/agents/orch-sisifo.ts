import type { PoolClient } from 'pg';

const XP_RULES: Record<string, number> = {
  login: 5,
  video: 10,
  recap_question: 5,
  perfect_recap: 10,
  ai_interaction: 5,
  assignment: 15,
  grade_8_plus: 10,
  forum: 5,
  streak_3: 15,
  streak_7: 30,
  streak_30: 100,
};

const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 7000];

const LEVEL_NAMES = [
  'Novato', 'Aprendiz', 'Estudante', 'Dedicado', 'Scholar', 'Expert',
  'Mestre', 'Guru', 'Lenda', 'ORCH Master', 'Iluminado', 'Transcendente',
];

interface AwardXPParams {
  studentId: string;
  tenantId: string;
  amount: number;
  source: string;
  sourceId?: string;
  description?: string;
}

interface GamificationStatus {
  studentId: string;
  totalXP: number;
  level: number;
  levelName: string;
  xpToNextLevel: number;
  currentStreak: number;
  bestStreak: number;
  badges: Badge[];
}

interface Badge {
  id: string;
  name: string;
  description: string;
  unlocked_at: Date;
}

interface LeaderboardEntry {
  student_id: string;
  student_name: string;
  total_xp: number;
  level: number;
  level_name: string;
  rank: number;
}

interface Mission {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward_xp: number;
  expires_at: Date | null;
}

function getLevelFromXP(xp: number): { level: number; name: string; xpToNext: number } {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i;
      break;
    }
  }
  const nextThreshold = LEVEL_THRESHOLDS[level + 1] ?? Infinity;
  return {
    level,
    name: LEVEL_NAMES[level] ?? 'Transcendente',
    xpToNext: nextThreshold - xp,
  };
}

class OrchSisifo {
  async awardXP(client: PoolClient, params: AwardXPParams): Promise<{ totalXP: number; leveledUp: boolean; newLevel: number }> {
    const { studentId, tenantId, amount, source, sourceId, description } = params;

    await client.query(
      `INSERT INTO orch_xp_transaction (student_id, tenant_id, amount, source, source_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [studentId, tenantId, amount, source, sourceId ?? null, description ?? null],
    );

    const prev = await client.query<{ total_xp: number; level: number }>(
      `SELECT total_xp, level FROM orch_gamification WHERE student_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentId, tenantId],
    );

    const prevXP = prev.rows[0]?.total_xp ?? 0;
    const prevLevel = prev.rows[0]?.level ?? 0;
    const newTotalXP = prevXP + amount;
    const { level: newLevel, name: newLevelName } = getLevelFromXP(newTotalXP);
    const leveledUp = newLevel > prevLevel;

    await client.query(
      `INSERT INTO orch_gamification (student_id, tenant_id, total_xp, level, level_name, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (student_id, tenant_id)
       DO UPDATE SET total_xp = $3, level = $4, level_name = $5, updated_at = NOW()`,
      [studentId, tenantId, newTotalXP, newLevel, newLevelName],
    );

    if (leveledUp) {
      await this.checkBadgeUnlock(client, studentId);
    }

    return { totalXP: newTotalXP, leveledUp, newLevel };
  }

  async getStatus(client: PoolClient, studentId: string, tenantId: string): Promise<GamificationStatus> {
    const gam = await client.query<{ total_xp: number; level: number; current_streak: number; best_streak: number }>(
      `SELECT total_xp, level, current_streak, best_streak
       FROM orch_gamification
       WHERE student_id = $1 AND tenant_id = $2 LIMIT 1`,
      [studentId, tenantId],
    );

    const row = gam.rows[0] ?? { total_xp: 0, level: 0, current_streak: 0, best_streak: 0 };
    const { level, name, xpToNext } = getLevelFromXP(row.total_xp);

    const badges = await client.query<Badge>(
      `SELECT b.id, b.name, b.description, ub.unlocked_at
       FROM orch_student_badge ub
       JOIN orch_badge b ON b.id = ub.badge_id
       WHERE ub.student_id = $1
       ORDER BY ub.unlocked_at DESC`,
      [studentId],
    );

    return {
      studentId,
      totalXP: row.total_xp,
      level,
      levelName: name,
      xpToNextLevel: xpToNext,
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
      badges: badges.rows,
    };
  }

  async checkStreak(client: PoolClient, studentId: string): Promise<{ currentStreak: number; bestStreak: number }> {
    const today = await client.query<{ has_activity: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM orch_xp_transaction
         WHERE student_id = $1 AND created_at::date = CURRENT_DATE
       ) AS has_activity`,
      [studentId],
    );

    if (!today.rows[0].has_activity) {
      await client.query(
        `UPDATE orch_gamification SET current_streak = 0, updated_at = NOW()
         WHERE student_id = $1`,
        [studentId],
      );
      const result = await client.query<{ current_streak: number; best_streak: number }>(
        `SELECT current_streak, best_streak FROM orch_gamification WHERE student_id = $1 LIMIT 1`,
        [studentId],
      );
      return { currentStreak: 0, bestStreak: result.rows[0]?.best_streak ?? 0 };
    }

    const result = await client.query<{ current_streak: number; best_streak: number }>(
      `UPDATE orch_gamification
       SET current_streak = current_streak + 1,
           best_streak = GREATEST(best_streak, current_streak + 1),
           updated_at = NOW()
       WHERE student_id = $1
       RETURNING current_streak, best_streak`,
      [studentId],
    );

    const { current_streak, best_streak } = result.rows[0] ?? { current_streak: 1, best_streak: 1 };

    // Award streak milestones
    const tenantResult = await client.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM orch_gamification WHERE student_id = $1 LIMIT 1`,
      [studentId],
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (tenantId) {
      const streakXP = current_streak === 3 ? XP_RULES.streak_3
        : current_streak === 7 ? XP_RULES.streak_7
        : current_streak === 30 ? XP_RULES.streak_30
        : 0;

      if (streakXP > 0) {
        await this.awardXP(client, {
          studentId,
          tenantId,
          amount: streakXP,
          source: `streak_${current_streak}`,
          description: `Streak de ${current_streak} dias`,
        });
      }
    }

    return { currentStreak: current_streak, bestStreak: best_streak };
  }

  async checkBadgeUnlock(client: PoolClient, studentId: string): Promise<void> {
    const badges = await client.query<{ id: string; condition_type: string; condition_value: number }>(
      `SELECT id, condition_type, condition_value FROM orch_badge
       WHERE id NOT IN (SELECT badge_id FROM orch_student_badge WHERE student_id = $1)`,
      [studentId],
    );

    const gam = await client.query<{ total_xp: number; level: number; best_streak: number }>(
      `SELECT total_xp, level, best_streak FROM orch_gamification WHERE student_id = $1 LIMIT 1`,
      [studentId],
    );
    const stats = gam.rows[0];
    if (!stats) return;

    for (const badge of badges.rows) {
      let unlock = false;
      if (badge.condition_type === 'xp' && stats.total_xp >= badge.condition_value) unlock = true;
      if (badge.condition_type === 'level' && stats.level >= badge.condition_value) unlock = true;
      if (badge.condition_type === 'streak' && stats.best_streak >= badge.condition_value) unlock = true;

      if (unlock) {
        await client.query(
          `INSERT INTO orch_student_badge (student_id, badge_id, unlocked_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT DO NOTHING`,
          [studentId, badge.id],
        );
      }
    }
  }

  async getLeaderboard(client: PoolClient, tenantId: string, classInstanceId?: string, limit = 20): Promise<LeaderboardEntry[]> {
    const classFilter = classInstanceId
      ? `AND g.student_id IN (SELECT student_id FROM class_instance_student WHERE class_instance_id = $3)`
      : '';
    const queryParams: (string | number)[] = [tenantId, limit];
    if (classInstanceId) queryParams.push(classInstanceId);

    const result = await client.query<LeaderboardEntry>(
      `SELECT g.student_id, u.name AS student_name, g.total_xp, g.level, g.level_name,
              ROW_NUMBER() OVER (ORDER BY g.total_xp DESC)::int AS rank
       FROM orch_gamification g
       JOIN "user" u ON u.id = g.student_id
       WHERE g.tenant_id = $1 ${classFilter}
       ORDER BY g.total_xp DESC
       LIMIT $2`,
      queryParams,
    );
    return result.rows;
  }

  async getMissions(client: PoolClient, studentId: string): Promise<Mission[]> {
    const result = await client.query<Mission>(
      `SELECT m.id, m.title, m.description, m.target, COALESCE(sm.progress, 0) AS progress,
              m.reward_xp, m.expires_at
       FROM orch_mission m
       LEFT JOIN orch_student_mission sm ON sm.mission_id = m.id AND sm.student_id = $1
       WHERE m.is_active = true AND (m.expires_at IS NULL OR m.expires_at > NOW())
       ORDER BY m.reward_xp DESC`,
      [studentId],
    );
    return result.rows;
  }
}

export const orchSisifo = new OrchSisifo();
