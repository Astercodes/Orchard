import { randomUUID } from "node:crypto";

export const lifeAreas = Object.freeze([
  "academics", "cognitive", "emotional", "social", "physical",
  "character", "nutrition", "creativity", "knowledge", "wellbeing",
]);
const experienceAreas = ["experiences", "learning", "creating", "visiting", "giving", "feeling"];
const statuses = ["on-track", "off-track", "achieved", "partial", "not-achieved", "deferred"];
const visionKeys = ["becoming", "priority", "support", "hope", "concern", "goodYear"];

function requireValue(condition, message) {
  if (!condition) throw new RangeError(message);
}

function option(value, allowed, label) {
  requireValue(allowed.includes(value), `Invalid ${label}`);
  return value;
}

function text(value, label, optional = false) {
  if (optional && value == null) return "";
  requireValue(typeof value === "string" && value.trim().length <= 4000 &&
    (optional || value.trim().length > 0), `Invalid ${label}`);
  return value.trim();
}

function date(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "Expected YYYY-MM-DD");
  const time = Date.parse(value);
  requireValue(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value, "Invalid calendar date");
  return time;
}

function month(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}$/.test(value), "Expected YYYY-MM");
  date(`${value}-01`);
  return value;
}

function integer(value, minimum, maximum, label) {
  requireValue(Number.isInteger(value) && value >= minimum && value <= maximum, `Invalid ${label}`);
  return value;
}

const dayMs = 86_400_000;
const iso = (time) => new Date(time).toISOString().slice(0, 10);
const weekMilestones = [4, 8, 13];

export function goalsForFamily(state, role) {
  option(role, ["parent", "child"], "role");
  function requireRole(expected) {
    requireValue(role === expected, `Only the ${expected} can perform this action`);
  }
  function read(kind, id) {
    const row = state.records.find((record) => record.kind === kind && record.id === id);
    requireValue(row, "Record not found");
    return structuredClone({ ...row.payload, id: row.id });
  }
  function records(kind, period) {
    return state.records.filter((row) => row.kind === kind && row.period === period)
      .map((row) => structuredClone({ ...row.payload, id: row.id }));
  }
  function write(kind, period, record, id = randomUUID()) {
    const index = state.records.findIndex((row) => row.kind === kind && row.id === id);
    const row = { kind, id, period, payload: record };
    if (index < 0) state.records.push(row);
    else state.records[index] = row;
    return { ...record, id };
  }

  return {
    monthlyGoals(period) {
      requireRole("parent");
      return records("monthly", month(period));
    },
    monthlyCheckInStatus(period, asOf) {
      requireRole("parent");
      month(period);
      date(asOf);
      return records("monthly", period).map((goal) => ({
        id: goal.id,
        status: goal.midMonth ? (goal.midMonth.late ? "completed-late" : "completed")
          : asOf < `${period}-14` ? "upcoming" : asOf <= `${period}-16` ? "due" : "missed",
      }));
    },
    addMonthlyGoal(period, input) {
      requireRole("parent");
      month(period);
      const area = option(input.area, lifeAreas, "life area");
      const goal = {
        month: period, area, title: text(input.title, "title"),
        priority: integer(input.priority, 1, 3, "priority"),
        successCriteria: text(input.successCriteria, "success criteria"),
        parentSupport: text(input.parentSupport, "parent support"),
        notes: text(input.notes, "notes", true), midMonth: null, outcome: null,
      };
      requireValue(records("monthly", period).filter((item) => item.area === area).length < 3,
        "This life area already has three goals for the month");
      return write("monthly", period, goal);
    },
    editMonthlyGoal(id, input) {
      requireRole("parent");
      const goal = read("monthly", id);
      if (input.title !== undefined) goal.title = text(input.title, "title");
      if (input.priority !== undefined) goal.priority = integer(input.priority, 1, 3, "priority");
      if (input.successCriteria !== undefined) goal.successCriteria = text(input.successCriteria, "success criteria");
      if (input.parentSupport !== undefined) goal.parentSupport = text(input.parentSupport, "parent support");
      if (input.notes !== undefined) goal.notes = text(input.notes, "notes", true);
      return write("monthly", goal.month, goal, id);
    },
    reviewMonthlyGoal(id, input) {
      requireRole("parent");
      const current = read("monthly", id);
      date(input.on);
      requireValue(input.on.startsWith(`${current.month}-`), "Review must fall in the goal month");
      const phase = option(input.phase, ["midMonth", "outcome"], "review phase");
      const review = {
        on: input.on,
        status: option(input.status, phase === "midMonth" ? statuses.slice(0, 2) : statuses.slice(2), "status"),
        notes: text(input.notes, "notes", true),
      };
      if (phase === "midMonth") {
        const day = Number(input.on.slice(-2));
        review.late = day > 16;
        requireValue(day >= 14, "Mid-month reviews open on day 14");
      }
      return write("monthly", current.month, { ...current, [phase]: review }, id);
    },
    annualSummary(year) {
      requireRole("parent");
      integer(year, 1000, 9999, "year");
      return Array.from({ length: 12 }, (_, index) => {
        const period = `${year}-${String(index + 1).padStart(2, "0")}`;
        return { month: period, goals: records("monthly", period).map((goal) => ({
          id: goal.id, area: goal.area, title: goal.title, status: goal.outcome?.status ?? "pending",
        })) };
      });
    },
    saveAnnualPlan(year, input) {
      requireRole("parent");
      integer(year, 1000, 9999, "year");
      const vision = Object.fromEntries(visionKeys.map((key) => [key, text(input.vision?.[key], key)]));
      requireValue(Array.isArray(input.goals) && input.goals.length <= lifeAreas.length, "Invalid annual goals");
      const goals = input.goals.map((goal) => {
        requireValue(Array.isArray(goal.checkpoints) && goal.checkpoints.length === 4, "Expected four quarterly checkpoints");
        return {
          area: option(goal.area, lifeAreas, "life area"), title: text(goal.title, "title"),
          successCriteria: text(goal.successCriteria, "success criteria"),
          parentCommitment: text(goal.parentCommitment, "parent commitment"),
          checkpoints: goal.checkpoints.map((item) => text(item, "checkpoint", true)),
        };
      });
      requireValue(new Set(goals.map((goal) => goal.area)).size === goals.length, "Use one annual goal per life area");
      const period = String(year);
      return write("annual", period, {
        year, vision, goals, word: text(input.word, "word of the year"),
        childWishes: text(input.childWishes, "child wishes", true),
        reflection: text(input.reflection, "reflection", true),
      }, period);
    },
    annualPlan(year) {
      requireRole("parent");
      const period = String(integer(year, 1000, 9999, "year"));
      return records("annual", period)[0] ?? null;
    },
    createSprint(input) {
      requireRole("parent");
      const start = date(input.start);
      requireValue(Array.isArray(input.areas) && input.areas.length >= 1 && input.areas.length <= 3, "Select one to three sprint areas");
      const areas = input.areas.map((area) => option(area, lifeAreas, "life area"));
      requireValue(new Set(areas).size === areas.length, "Sprint areas must be distinct");
      const weeks = Array.from({ length: 13 }, (_, index) => ({
        week: index + 1, start: iso(start + index * 7 * dayMs),
        phase: ["foundation", "development", "intensify", "close"][Math.floor(index / 4)],
        action: "", progress: "", checkIn: "",
      }));
      return write("sprint", "", {
        title: text(input.title, "title"), start: input.start, end: iso(start + 89 * dayMs),
        areas, weeks, parentCommitment: text(input.parentCommitment, "parent commitment"),
      });
    },
    updateSprintWeek(id, week, input) {
      requireRole("parent");
      integer(week, 1, 13, "week");
      const sprint = read("sprint", id);
      requireValue(weekMilestones.filter((checkpoint) => checkpoint < week)
        .every((checkpoint) => sprint.weeks[checkpoint - 1].checkIn), "Complete the preceding phase check-in first");
      const entry = sprint.weeks[week - 1];
      if (input.action !== undefined) entry.action = text(input.action, "action", true);
      if (input.progress !== undefined) entry.progress = text(input.progress, "progress", true);
      if (input.checkIn !== undefined) {
        requireValue(weekMilestones.includes(week), "This week has no phase check-in");
        entry.checkIn = text(input.checkIn, "check-in");
      }
      return write("sprint", "", sprint, id);
    },
    createMilestone(input) {
      requireRole("parent");
      const start = date(input.start);
      const due = date(input.due);
      const days = (due - start) / dayMs;
      integer(days, 0, 366, "countdown length in days");
      const weeks = Array.from({ length: Math.ceil(days / 7) }, (_, index) => {
        const remaining = Math.ceil(days / 7) - index;
        return {
          remaining, start: iso(Math.max(start, due - remaining * 7 * dayMs)),
          end: iso(due - ((remaining - 1) * 7 + 1) * dayMs), focus: "", readiness: "",
        };
      });
      return write("milestone", "", {
        title: text(input.title, "title"), type: text(input.type, "milestone type"),
        start: input.start, due: input.due, weeks, celebration: "", reflection: "",
      });
    },
    updateMilestone(id, input) {
      requireRole("parent");
      const milestone = read("milestone", id);
      if (input.celebration !== undefined) milestone.celebration = text(input.celebration, "celebration", true);
      if (input.reflection !== undefined) milestone.reflection = text(input.reflection, "reflection", true);
      if (input.week !== undefined) {
        const week = milestone.weeks.find((item) => item.remaining === input.week);
        requireValue(week, "Countdown week not found");
        if (input.focus !== undefined) week.focus = text(input.focus, "weekly focus", true);
        if (input.readiness !== undefined) week.readiness = text(input.readiness, "readiness", true);
      }
      return write("milestone", "", milestone, id);
    },
    addExperience(input) {
      requireRole("parent");
      return write("experience", "", {
        title: text(input.title, "title"), category: option(input.category, experienceAreas, "experience category"),
        agePhase: integer(input.agePhase, 1, 6, "age phase"), completedOn: null, notes: "",
      });
    },
    completeExperience(id, on, notes) {
      requireRole("parent");
      date(on);
      return write("experience", "", {
        ...read("experience", id), completedOn: on, notes: text(notes, "notes", true),
      }, id);
    },
    listPlans(kind) {
      requireRole("parent");
      return records(option(kind, ["sprint", "milestone", "experience"], "plan type"), "");
    },
    addHabit(period, input) {
      requireRole("parent");
      month(period);
      const area = option(input.area, lifeAreas, "life area");
      requireValue(records("habit", period).length < 15, "A month can contain up to 15 habits");
      if (input.goalId != null) {
        const goal = read("monthly", input.goalId);
        requireValue(goal.month === period && goal.area === area, "Link to a goal in the same month and life area");
      }
      return write("habit", period, {
        month: period, area, title: text(input.title, "title"), goalId: input.goalId ?? null,
      });
    },
    setHabitTick(id, on, completed) {
      requireRole("child");
      date(on);
      requireValue(typeof completed === "boolean", "Completion must be true or false");
      const habit = read("habit", id);
      requireValue(on.startsWith(`${habit.month}-`), "Completion must fall in the habit month");
      const dates = new Set(state.ticks[id] ?? []);
      if (completed) dates.add(on);
      else dates.delete(on);
      state.ticks[id] = [...dates].sort();
    },
    habitTracker(period) {
      const start = date(`${month(period)}-01`);
      const followingMonth = new Date(start);
      followingMonth.setUTCMonth(followingMonth.getUTCMonth() + 1);
      const days = (followingMonth.getTime() - start) / dayMs;
      const habits = records("habit", period).map((habit) => {
        const completed = state.ticks[habit.id] ?? [];
        let streak = 0;
        let longestStreak = 0;
        let previous = null;
        for (const day of completed) {
          const current = date(day);
          streak = previous !== null && current - previous === dayMs ? streak + 1 : 1;
          longestStreak = Math.max(longestStreak, streak);
          previous = current;
        }
        return { ...habit, completed, longestStreak };
      });
      const daily = Array.from({ length: days }, (_, index) => {
        const day = iso(start + index * dayMs);
        return { day, completed: habits.filter((habit) => habit.completed.includes(day)).length };
      });
      const weekly = Array.from({ length: Math.ceil(days / 7) }, (_, index) => ({
        week: index + 1, completed: daily.slice(index * 7, index * 7 + 7).reduce((sum, item) => sum + item.completed, 0),
      }));
      const byArea = lifeAreas.map((area) => {
        const selected = habits.filter((habit) => habit.area === area);
        const completed = selected.reduce((sum, habit) => sum + habit.completed.length, 0);
        return { area, completed, possible: selected.length * days };
      });
      return { month: period, habits, daily, weekly, byArea };
    },
  };
}
