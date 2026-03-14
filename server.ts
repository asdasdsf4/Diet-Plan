import { Hono } from "jsr:@hono/hono@4.6.5";
import { getCookie, setCookie } from "jsr:@hono/hono@4.6.5/cookie";
import { serveStatic } from "jsr:@hono/hono@4.6.5/deno";

type AtlasDoc = Record<string, unknown>;

const app = new Hono();

const DATA_API_URL = Deno.env.get("MONGODB_DATA_API_URL") ?? "";
const DATA_API_KEY = Deno.env.get("MONGODB_DATA_API_KEY") ?? "";
const DATA_SOURCE = Deno.env.get("MONGODB_DATA_SOURCE") ?? "Cluster0";
const DB_NAME = Deno.env.get("DB_NAME") ?? "dietplan";

const MEAL_TYPE_ORDER = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "evening_snack",
];

function page(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/static/style.css" />
</head>
<body>
  <main style="max-width: 860px; margin: 0 auto; padding: 16px;">
    ${body}
  </main>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function atlasAction(action: string, payload: AtlasDoc): Promise<AtlasDoc> {
  if (!DATA_API_URL || !DATA_API_KEY) {
    throw new Error("Missing MONGODB_DATA_API_URL or MONGODB_DATA_API_KEY");
  }

  const response = await fetch(`${DATA_API_URL}/action/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": DATA_API_KEY,
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DB_NAME,
      ...payload,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Atlas Data API error (${response.status}): ${errText}`);
  }

  return await response.json();
}

const oid = (id: string) => ({ $oid: id });

app.use("/static/*", serveStatic({ root: "." }));

app.get("/health", (c) => c.text("ok"));

app.get("/", (c) => {
  const profileId = getCookie(c, "profile_id");
  const message = profileId
    ? `<p>Profile active. <a href='/dashboard'>Go to dashboard</a>.</p>`
    : "<p>Create your profile to continue.</p>";

  return c.html(page("Diet Plan", `
    <h1>Diet Plan Dashboard (Deno Deploy)</h1>
    ${message}
    <form method='post' action='/profile/create'>
      <label>Name <input name='name' required minlength='2' /></label>
      <button type='submit'>Create profile</button>
    </form>
  `));
});

app.post("/profile/create", async (c) => {
  const form = await c.req.formData();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return c.text("Name is required", 400);

  const created = await atlasAction("insertOne", {
    collection: "profiles",
    document: { name, created_at: { $date: new Date().toISOString() } },
  });

  const profileId = String((created.insertedId as AtlasDoc)?.$oid ?? "");
  if (!profileId) return c.text("Failed to create profile", 500);

  setCookie(c, "profile_id", profileId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  return c.redirect("/dashboard");
});

app.get("/dashboard", async (c) => {
  const profileId = getCookie(c, "profile_id");
  if (!profileId) return c.redirect("/");

  const viewDate = c.req.query("view_date") ?? new Date().toISOString().slice(0, 10);

  const mealsRes = await atlasAction("find", {
    collection: "meal_plans",
    filter: {
      plan_date: viewDate,
      $or: [{ profile_id: "0" }, { profile_id: oid(profileId) }],
    },
    sort: { meal_type: 1 },
    limit: 100,
  });

  const checksRes = await atlasAction("find", {
    collection: "meal_checks",
    filter: { profile_id: oid(profileId), checked_date: viewDate },
    limit: 200,
  });

  const checkedIds = new Set(
    ((checksRes.documents as AtlasDoc[]) ?? []).map((d) => String(((d.meal_plan_id as AtlasDoc)?.$oid) ?? "")),
  );

  const meals = ((mealsRes.documents as AtlasDoc[]) ?? []).sort(
    (a, b) =>
      MEAL_TYPE_ORDER.indexOf(String(a.meal_type ?? "")) -
      MEAL_TYPE_ORDER.indexOf(String(b.meal_type ?? "")),
  );

  const mealHtml = meals.map((m) => {
    const id = String(((m._id as AtlasDoc)?.$oid) ?? "");
    const checked = checkedIds.has(id);
    return `<article style='border:1px solid #ddd;padding:12px;margin:10px 0;border-radius:10px;'>
      <h3>${escapeHtml(String(m.dish_name ?? "Untitled"))}</h3>
      <p><strong>${escapeHtml(String(m.meal_type ?? "meal"))}</strong> • ${Number(m.calories ?? 0)} kcal</p>
      <p>${escapeHtml(String(m.description ?? ""))}</p>
      <form method='post' action='/meal/toggle/${id}?view_date=${viewDate}'>
        <button type='submit'>${checked ? "✅ Prepared" : "⬜ Mark prepared"}</button>
      </form>
    </article>`;
  }).join("\n") || "<p>No meals found for this date.</p>";

  return c.html(page("Dashboard", `
    <h1>Dashboard</h1>
    <p>Date: <strong>${escapeHtml(viewDate)}</strong></p>
    <p><a href='/history'>History</a></p>
    ${mealHtml}
  `));
});

app.post("/meal/toggle/:id", async (c) => {
  const profileId = getCookie(c, "profile_id");
  if (!profileId) return c.redirect("/");

  const mealPlanId = c.req.param("id");
  const viewDate = c.req.query("view_date") ?? new Date().toISOString().slice(0, 10);

  const existing = await atlasAction("findOne", {
    collection: "meal_checks",
    filter: {
      profile_id: oid(profileId),
      meal_plan_id: oid(mealPlanId),
      checked_date: viewDate,
    },
  });

  if (existing.document) {
    await atlasAction("deleteOne", {
      collection: "meal_checks",
      filter: { _id: (existing.document as AtlasDoc)._id },
    });
  } else {
    await atlasAction("insertOne", {
      collection: "meal_checks",
      document: {
        profile_id: oid(profileId),
        meal_plan_id: oid(mealPlanId),
        checked_date: viewDate,
        created_at: { $date: new Date().toISOString() },
      },
    });
  }

  return c.redirect(`/dashboard?view_date=${viewDate}`);
});

app.get("/history", async (c) => {
  const profileId = getCookie(c, "profile_id");
  if (!profileId) return c.redirect("/");

  const checks = await atlasAction("find", {
    collection: "meal_checks",
    filter: { profile_id: oid(profileId) },
    sort: { checked_date: -1 },
    limit: 200,
  });

  const rows = ((checks.documents as AtlasDoc[]) ?? []).map((doc) => {
    const d = String(doc.checked_date ?? "");
    const id = String(((doc.meal_plan_id as AtlasDoc)?.$oid) ?? "");
    return `<li>${escapeHtml(d)} — Meal ${escapeHtml(id)}</li>`;
  }).join("\n") || "<li>No check history yet.</li>";

  return c.html(page("History", `
    <h1>Meal History</h1>
    <p><a href='/dashboard'>Back to dashboard</a></p>
    <ul>${rows}</ul>
  `));
});

Deno.serve(app.fetch);
