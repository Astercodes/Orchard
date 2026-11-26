const app = document.querySelector("#app");
const accountBar = document.querySelector("#account");
const notice = document.querySelector("#notice");
const state = { account: null, areas: [], tab: "monthly", period: localDate().slice(0, 7) };
let renderVersion = 0;

function localDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const title = (value) => String(value ?? "").replaceAll("-", " ").replace(/^./, (ch) => ch.toUpperCase());
const button = (label) => `<button class="primary" type="submit">${label}</button>`;
const panel = (content) => `<article class="panel">${content}</article>`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${safe(value)}">`;
const field = (label, name, value = "", type = "text", required = true, attrs = "") =>
  `<label>${label}<input type="${type}" name="${name}" value="${safe(value)}" ${required ? "required" : ""} ${attrs}></label>`;
const areaOptions = () => state.areas.map((area) => [area, title(area)]);
const select = (label, name, options, selected) => `<label>${label}<select name="${name}">${options.map(([v, l]) =>
  `<option value="${safe(v)}"${v === selected ? " selected" : ""}>${safe(l)}</option>`).join("")}</select></label>`;
const form = (action, content, label) => `<form data-action="${action}">${content}${button(label)}</form>`;
const expandable = (label, content) => `<details><summary>${label}</summary>${content}</details>`;
const statuses = {
  midMonth: [["on-track", "On track"], ["off-track", "Off track"]],
  outcome: [["achieved", "Achieved"], ["partial", "Partly achieved"], ["not-achieved", "Not achieved"], ["deferred", "Deferred"]],
};
const tabs = [
  ["monthly", "Monthly goals"], ["annual", "Annual plan"], ["sprint", "90-day sprints"],
  ["milestone", "Milestones"], ["experience", "Experiences"], ["habits", "Habits"],
];

async function api(path, data) {
  const res = await fetch(path, data === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.result;
}

const goals = (action, data = {}) => api("/api/goals", { action, ...data });

function login() {
  const creating = location.hash === "#create-account";
  const email = field("Email address", "email", "", "email", true, 'autocomplete="username"');
  const credentials = creating
    ? email + field("Password", "password", "", "password", true, 'autocomplete="new-password" minlength="12" aria-describedby="password-hint"') +
      '<small id="password-hint">Use at least 12 characters.</small>' +
      field("Parent setup code", "setupCode", "", "password", true, 'autocomplete="off"')
    : email + field("Password", "password", "", "password", true, 'autocomplete="current-password"');
  return `<section class="auth" aria-labelledby="auth-title">
    <div class="auth-art" aria-hidden="true">
      <img src="/assets/orchard-fruit.webp" alt="" width="1536" height="864">
    </div>
    <div class="auth-content">
      <p class="auth-label">Orchard Goals</p>
      <h1 id="auth-title" tabindex="-1">${creating ? "Create your parent account" : "Sign in to Orchard"}</h1>
      <p>${creating ? "Use your parent setup code to open your family’s Goals workspace." : "Pick up where you left off with your family’s goals and habits."}</p>
      ${form(creating ? "register" : "login", credentials, creating ? "Create parent account" : "Sign in")}
      <p class="auth-switch">${creating ? 'Already have an account? <a href="#sign-in">Sign in</a>' : 'New to Orchard? <a href="#create-account">Create a parent account</a>'}</p>
    </div>
  </section>`;
}

const monthInput = () => `<label>Planning month<input id="period" type="month" value="${safe(state.period)}" required></label>`;

async function monthly() {
  const data = { period: state.period };
  const [items, checks] = await Promise.all([
    goals("monthlyGoals", data), goals("monthlyCheckInStatus", { ...data, on: localDate() }),
  ]);
  const checkStates = new Map(checks.map(({ id, status }) => [id, status]));
  const fields = (item = {}) => field("Goal", "title", item.title) +
    select("Priority", "priority", [["1", "High"], ["2", "Medium"], ["3", "Low"]], String(item.priority ?? 1)) +
    field("How will you know it worked?", "successCriteria", item.successCriteria) +
    field("How will you help?", "parentSupport", item.parentSupport) +
    field("Notes", "notes", item.notes, "text", false);
  const reviews = (item, phase) => {
    const [year, month] = item.month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const earliest = `${item.month}-${phase === "midMonth" ? "14" : "01"}`;
    const latest = `${item.month}-${lastDay}`;
    const defaultDate = phase === "midMonth" ? `${item.month}-15` : latest;
    return form("reviewMonthlyGoal", hidden("id", item.id) + hidden("phase", phase) +
      field("Review date", "on", item[phase]?.on ?? defaultDate, "date", true, `min="${earliest}" max="${latest}"`) +
      select("Status", "status", statuses[phase], item[phase]?.status) +
      field("Review notes", "notes", item[phase]?.notes, "text", false), "Save review");
  };
  return panel(`<h2>Add a monthly goal</h2>${form("addMonthlyGoal", select("Life area", "area", areaOptions()) + fields(), "Add goal")}`) +
    (items.length ? `<div class="tiles">${items.map((item) => panel(`<p class="meta">${safe(title(item.area))} · Priority ${item.priority}</p>
      <h3>${safe(item.title)}</h3><p>${safe(item.successCriteria)}</p>
      <p>Check-in: ${safe(title(checkStates.get(item.id)))} · Outcome: ${safe(title(item.outcome?.status ?? "pending"))}</p>
      <div class="stack">
        ${expandable("Edit goal", form("editMonthlyGoal", hidden("id", item.id) + fields(item), "Save goal"))}
        ${expandable("Mid-month check-in", reviews(item, "midMonth"))}
        ${expandable("Month-end outcome", reviews(item, "outcome"))}
      </div>`)).join("")}</div>` : panel("<p>No goals for this month yet.</p>"));
}

const vision = [
  ["becoming", "Who are they becoming?"], ["priority", "What matters most this year?"],
  ["support", "What support do they need?"], ["hope", "What is your biggest hope?"],
  ["concern", "What is your biggest concern?"], ["goodYear", "What would make this a good year?"],
];

async function annual() {
  const year = Number(state.period.slice(0, 4));
  const [plan, summary] = await Promise.all([goals("annualPlan", { year }), goals("annualSummary", { year })]);
  const area = state.annualArea ?? state.areas[0];
  const current = plan?.goals.find((item) => item.area === area);
  return panel(`<h2>${year} vision</h2>
    ${form("saveVision", field("Word of the year", "word", plan?.word) +
      `<div class="grid">${vision.map(([key, label]) => field(label, key, plan?.vision[key])).join("")}</div>` +
      field("Child’s wishes", "childWishes", plan?.childWishes, "text", false) +
      field("Year-end reflection", "reflection", plan?.reflection, "text", false), "Save vision")}`) +
    (plan ? panel(`<h2>Annual goals by life area</h2>
      <label>Life area<select id="annual-area">${areaOptions().map(([v, l]) => `<option value="${safe(v)}" ${v === area ? "selected" : ""}>${safe(l)}</option>`).join("")}</select></label>
      ${form("saveAnnualGoal", field("Annual goal", "title", current?.title) +
        field("Success criteria", "successCriteria", current?.successCriteria) +
        field("Parent commitment", "parentCommitment", current?.parentCommitment) +
        `<div class="grid">${Array.from({ length: 4 }, (_, i) => field(`Quarter ${i + 1} checkpoint`, `q${i}`, current?.checkpoints[i], "text", false)).join("")}</div>`,
        "Save annual goal")}`) : "") +
    panel(`<h2>Monthly outcomes</h2><div class="tiles">${summary.map((item) =>
      `<div><strong>${safe(item.month)}</strong><p>${item.goals.length
        ? item.goals.map((g) => `${safe(g.title)} · ${safe(title(g.status))}`).join("<br>") : "No goals"}</p></div>`).join("")}</div>`);
}

async function sprint() {
  const items = await goals("listPlans", { kind: "sprint" });
  const options = [["", "None"], ...areaOptions()];
  return panel(`<h2>Start a 90-day sprint</h2>${form("createSprint",
    field("Sprint name", "title") + field("Start date", "start", localDate(), "date") +
    `<div class="grid">${select("Primary area", "area1", areaOptions())}${select("Second area", "area2", options)}
      ${select("Third area", "area3", options)}</div>` + field("Parent commitment", "parentCommitment"), "Create sprint")}`) +
    items.map((item) => panel(`<h2>${safe(item.title)}</h2><p>${safe(item.start)} to ${safe(item.end)} · ${item.areas.map((a) => safe(title(a))).join(", ")}</p>
      <div class="stack">${item.weeks.map((week) => expandable(`Week ${week.week} · ${title(week.phase)}`,
        form("updateSprintWeek", hidden("id", item.id) + hidden("week", week.week) +
          field("Action", "action", week.action, "text", false) + field("Progress", "progress", week.progress, "text", false) +
          ([4, 8, 13].includes(week.week) ? field("Phase check-in", "checkIn", week.checkIn, "text", false) : ""), "Save week"))).join("")}</div>`)).join("");
}

async function milestone() {
  const items = await goals("listPlans", { kind: "milestone" });
  return panel(`<h2>Plan a milestone</h2>${form("createMilestone", field("Milestone name", "title") +
    field("Milestone type", "type") + `<div class="grid">${field("Start planning", "start", localDate(), "date")}
    ${field("Milestone date", "due", "", "date")}</div>`, "Create countdown")}`) +
    items.map((item) => panel(`<h2>${safe(item.title)}</h2><p>${safe(item.type)} · ${safe(item.due)}</p>
      <div class="stack">${item.weeks.map((week) => expandable(`${week.remaining} week(s) out · ${safe(week.start)} to ${safe(week.end)}`,
        form("updateMilestone", hidden("id", item.id) + hidden("week", week.remaining) +
          field("Focus", "focus", week.focus, "text", false) + field("Readiness", "readiness", week.readiness, "text", false), "Save week"))).join("")}
      ${expandable("Celebration and reflection", form("updateMilestone", hidden("id", item.id) +
        field("Celebration", "celebration", item.celebration, "text", false) +
        field("Reflection", "reflection", item.reflection, "text", false), "Save reflection"))}</div>`)).join("");
}

async function experience() {
  const items = await goals("listPlans", { kind: "experience" });
  const categories = ["experiences", "learning", "creating", "visiting", "giving", "feeling"];
  const phases = ["Birth–2", "Ages 3–5", "Ages 6–8", "Ages 9–11", "Ages 12–14", "Ages 15–18"];
  return panel(`<h2>Add an experience</h2>${form("addExperience", field("Experience", "title") +
    select("Category", "category", categories.map((v) => [v, title(v)])) +
    select("Age phase", "agePhase", phases.map((v, i) => [String(i + 1), v])), "Add experience")}`) +
    `<div class="tiles">${items.map((item) => panel(`<h3>${safe(item.title)}</h3>
      <p>${safe(title(item.category))} · ${phases[item.agePhase - 1]}${item.completedOn ? ` · Completed ${safe(item.completedOn)}` : ""}</p>
      ${expandable("Log completion", form("completeExperience", hidden("id", item.id) +
        field("Date", "on", item.completedOn ?? localDate(), "date") +
        field("What do you want to remember?", "notes", item.notes, "text", false), "Save experience"))}`)).join("")}</div>`;
}

async function habits() {
  const parent = state.account.role === "parent";
  const track = await goals("habitTracker", { period: state.period });
  const daily = track.daily.map(({ day }) => day);
  const setup = parent ? panel(`<h2>Set up a habit</h2>${form("addHabit",
    field("Habit", "title") + select("Life area", "area", areaOptions()) +
    select("Monthly goal, if related", "goalId", [["", "None"], ...(await goals("monthlyGoals", { period: state.period }))
      .map((goal) => [goal.id, `${goal.title} (${title(goal.area)})`])]), "Add habit")}`) : "";
  const progress = track.habits.length ? panel(`<h2>Monthly progress</h2><div class="tiles">${track.weekly.map((entry) =>
    `<div>Week ${entry.week} · ${entry.completed} completed</div>`).join("")}</div>`) : "";
  return setup + progress + (track.habits.length ? track.habits.map((habit) => {
    const completed = new Set(habit.completed);
    return panel(`<h3>${safe(habit.title)}</h3>
      <p>${safe(title(habit.area))} · ${completed.size} days completed · Longest streak ${habit.longestStreak}</p>
      <div class="day-grid" aria-label="Habit days">${daily.map((day) => {
        const done = completed.has(day);
        const number = Number(day.slice(-2));
        return parent ? `<span data-completed="${done}" aria-label="${day}: ${done ? "completed" : "incomplete"}">${number}</span>` :
          `<button type="button" data-habit="${safe(habit.id)}" data-day="${day}" data-completed="${done}" aria-label="${day}" aria-pressed="${done}">${number}</button>`;
      }).join("")}</div>`);
  }).join("") : panel("<p>No habits for this month yet.</p>"));
}

function childSetup() {
  return state.account.hasChild ? panel("<p>A child sign-in is set up for this family.</p>") :
    panel(expandable("Set up a child sign-in", form("child", field("Child sign-in email", "email", "", "email") +
      field("Child password", "password", "", "password", true, 'autocomplete="new-password" minlength="12"'), "Create child sign-in")));
}

async function render() {
  const version = ++renderVersion;
  if (!state.account) {
    accountBar.innerHTML = "";
    app.innerHTML = login();
    return;
  }
  const parent = state.account.role === "parent";
  accountBar.innerHTML = `<span>${safe(state.account.email)}</span><button id="logout" type="button">Sign out</button>`;
  const active = parent ? state.tab : "habits";
  const view = { monthly, annual, sprint, milestone, experience, habits }[active];
  const content = await view();
  if (version !== renderVersion) return;
  app.innerHTML = `<div class="hero"><div><h1>${parent ? "Goals" : "My habits"}</h1>
    <p>${parent ? "Plan what matters and make time to review it." : "Mark the days you practiced each habit."}</p></div>${monthInput()}</div>
    ${parent ? `<nav aria-label="Goals tools">${tabs.map(([key, label]) => `<button type="button" class="tab" data-tab="${key}"
      ${key === active ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>` : ""}
    ${content}${parent && active === "habits" ? childSetup() : ""}`;
}

async function submit(action, data) {
  if (["login", "register", "child"].includes(action)) {
    state.account = await api(`/api/${action}`, data);
    if (action !== "child" && location.hash) history.replaceState(null, "", location.pathname + location.search);
    return;
  }
  const { id, on, notes, week, ...rest } = data;
  const { period } = state;
  if (["saveVision", "saveAnnualGoal"].includes(action)) {
    const year = Number(period.slice(0, 4));
    const plan = await goals("annualPlan", { year });
    if (action === "saveVision") {
      const questions = Object.fromEntries(vision.map(([key]) => [key, data[key]]));
      await goals("saveAnnualPlan", { year, input: { ...data, vision: questions, goals: plan?.goals ?? [] } });
    } else {
      const area = state.annualArea ?? state.areas[0];
      const updated = { ...data, area, checkpoints: Array.from({ length: 4 }, (_, i) => data[`q${i}`]) };
      await goals("saveAnnualPlan", { year, input: { ...plan, goals: [...plan.goals.filter((g) => g.area !== area), updated] } });
    }
    return;
  }
  if (["addMonthlyGoal", "editMonthlyGoal"].includes(action)) rest.priority = Number(rest.priority);
  if (action === "createSprint") rest.areas = [rest.area1, rest.area2, rest.area3].filter(Boolean);
  if (action === "addExperience") rest.agePhase = Number(rest.agePhase);
  if (action === "addHabit") rest.goalId ||= null;
  if (action === "reviewMonthlyGoal") Object.assign(rest, { on, notes });
  if (["addMonthlyGoal", "editMonthlyGoal"].includes(action)) rest.notes = notes;
  if (action === "updateMilestone" && week) rest.week = Number(week);
  if (action === "updateSprintWeek" && !rest.checkIn) delete rest.checkIn;
  await goals(action, { id, on, notes, week: week ? Number(week) : undefined, period, input: rest });
}

async function run(operation, control, message = "") {
  if (control) control.disabled = true;
  notice.textContent = "";
  try {
    await operation();
    await render();
    notice.textContent = message;
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    if (control) control.disabled = false;
  }
}

document.addEventListener("submit", (event) => {
  const formElement = event.target.closest("form[data-action]");
  if (!formElement) return;
  event.preventDefault();
  void run(() => submit(formElement.dataset.action, Object.fromEntries(new FormData(formElement))), event.submitter, "Saved.");
});

document.addEventListener("click", (event) => {
  const clicked = event.target.closest("button");
  if (!clicked) return;
  if (clicked.id === "logout") {
    void run(async () => { await api("/api/logout", {}); state.account = null; state.tab = "monthly"; }, clicked);
  } else if (clicked.dataset.tab) {
    void run(() => { state.tab = clicked.dataset.tab; }, clicked);
  } else if (clicked.dataset.habit) {
    const { habit, day, completed } = clicked.dataset;
    void run(() => goals("setHabitTick", { id: habit, on: day, completed: completed !== "true" }), clicked, "Habit updated.");
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "period" && /^\d{4}-\d{2}$/.test(event.target.value)) {
    void run(() => { state.period = event.target.value; });
  } else if (event.target.id === "annual-area") {
    void run(() => { state.annualArea = event.target.value; });
  }
});

window.addEventListener("hashchange", () => {
  if (state.account) return;
  notice.textContent = "";
  void render().then(() => document.querySelector("#auth-title")?.focus());
});

void run(async () => Object.assign(state, await api("/api/session")));
