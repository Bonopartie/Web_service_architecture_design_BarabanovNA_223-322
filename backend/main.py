import os
from typing import Optional

import psycopg
from psycopg.rows import dict_row
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

DATABASE_URL = os.environ["DATABASE_URL"]

app = FastAPI(title="Скалодром API")


def query(sql: str, params: tuple = (), one: bool = False):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else []
    return (rows[0] if rows else None) if one else rows


@app.get("/api/health")
def health():
    query("SELECT 1")
    return {"status": "ok"}


@app.get("/api/sectors")
def sectors():
    return query("""
        SELECT s.id, s.name, s.discipline, s.angle_deg,
               COUNT(r.id) FILTER (WHERE r.is_active) AS routes
        FROM sectors s LEFT JOIN routes r ON r.sector_id = s.id
        GROUP BY s.id ORDER BY s.id
    """)


@app.get("/api/grades")
def grades():
    return query("SELECT grade FROM grades ORDER BY sort_order")


@app.get("/api/climbers")
def climbers():
    return query("SELECT id, name FROM climbers ORDER BY name")


ROUTE_FIELDS = """
    r.id, r.name, r.grade, r.hold_color, r.setter,
    to_char(r.set_date, 'DD.MM.YYYY') AS set_date,
    s.name AS sector, s.discipline,
    (SELECT COUNT(*) FROM ascents a WHERE a.route_id = r.id) AS ascents
"""


@app.get("/api/routes")
def routes(sector_id: Optional[int] = None):
    return query(f"""
        SELECT {ROUTE_FIELDS}
        FROM routes r JOIN sectors s ON s.id = r.sector_id
        JOIN grades g ON g.grade = r.grade
        WHERE r.is_active AND (%s::int IS NULL OR r.sector_id = %s::int)
        ORDER BY s.id, g.sort_order
    """, (sector_id, sector_id))


@app.get("/api/routes/random")
def random_route(min_grade: str = "5a", max_grade: str = "8a"):
    row = query(f"""
        SELECT {ROUTE_FIELDS}
        FROM routes r JOIN sectors s ON s.id = r.sector_id
        JOIN grades g ON g.grade = r.grade
        WHERE r.is_active
          AND g.sort_order BETWEEN (SELECT sort_order FROM grades WHERE grade = %s)
                               AND (SELECT sort_order FROM grades WHERE grade = %s)
        ORDER BY random() LIMIT 1
    """, (min_grade, max_grade), one=True)
    if not row:
        raise HTTPException(404, "В этом диапазоне сейчас нет трасс")
    return row


@app.get("/api/routes/fresh")
def fresh_routes(days: int = 7):
    return query(f"""
        SELECT {ROUTE_FIELDS}, CURRENT_DATE - r.set_date AS days_ago
        FROM routes r JOIN sectors s ON s.id = r.sector_id
        WHERE r.is_active AND r.set_date >= CURRENT_DATE - %s::int
        ORDER BY r.set_date DESC
    """, (days,))


@app.get("/api/routes/{route_id}/ascents")
def route_ascents(route_id: int):
    return query("""
        SELECT c.name AS climber, a.style, to_char(a.ascent_date, 'DD.MM.YYYY') AS date
        FROM ascents a JOIN climbers c ON c.id = a.climber_id
        WHERE a.route_id = %s ORDER BY a.ascent_date DESC, a.id DESC
    """, (route_id,))


@app.get("/api/leaderboard")
def leaderboard(days: int = 30):
    # онсайт даёт +50% очков, флэш +25%
    return query("""
        SELECT c.name,
               COUNT(DISTINCT a.route_id) AS routes,
               ROUND(SUM(g.points * CASE a.style WHEN 'онсайт' THEN 1.5
                                                 WHEN 'флэш'   THEN 1.25
                                                 ELSE 1 END))::int AS score,
               (ARRAY_AGG(g.grade ORDER BY g.sort_order DESC))[1] AS best_grade
        FROM ascents a
        JOIN climbers c ON c.id = a.climber_id
        JOIN routes r   ON r.id = a.route_id
        JOIN grades g   ON g.grade = r.grade
        WHERE a.ascent_date >= CURRENT_DATE - %s::int
        GROUP BY c.name
        ORDER BY score DESC
    """, (days,))


@app.get("/api/stats/grades")
def grade_stats():
    return query("""
        SELECT g.grade,
               COUNT(DISTINCT r.id) AS routes,
               COUNT(a.id)          AS ascents
        FROM grades g
        LEFT JOIN routes r  ON r.grade = g.grade AND r.is_active
        LEFT JOIN ascents a ON a.route_id = r.id
        GROUP BY g.grade, g.sort_order
        HAVING COUNT(DISTINCT r.id) > 0
        ORDER BY g.sort_order
    """)


class AscentIn(BaseModel):
    climber: str
    route_id: int
    style: str


@app.post("/api/ascents", status_code=201)
def add_ascent(body: AscentIn):
    name = body.climber.strip()
    if not name:
        raise HTTPException(400, "Укажи имя скалолаза")
    if body.style not in ("онсайт", "флэш", "редпоинт"):
        raise HTTPException(400, "Стиль: онсайт, флэш или редпоинт")

    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, grade FROM routes WHERE id = %s AND is_active",
                        (body.route_id,))
            route = cur.fetchone()
            if not route:
                raise HTTPException(404, "Трасса не найдена или уже скручена")
            cur.execute("""
                INSERT INTO climbers (name) VALUES (%s)
                ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
            """, (name,))
            climber_id = cur.fetchone()["id"]
            cur.execute("""
                INSERT INTO ascents (climber_id, route_id, style)
                VALUES (%s, %s, %s) RETURNING id
            """, (climber_id, body.route_id, body.style))
            ascent_id = cur.fetchone()["id"]

    return {"id": ascent_id, "climber": name, "route": route["name"],
            "grade": route["grade"], "style": body.style}
