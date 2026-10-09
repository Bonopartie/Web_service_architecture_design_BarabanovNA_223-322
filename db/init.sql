-- Скалодром: схема и стартовые данные

CREATE TABLE grades (
    grade      VARCHAR(4) PRIMARY KEY,   -- французская категория: 5a ... 8a
    sort_order INT NOT NULL UNIQUE,      -- для сравнения "сложнее/проще"
    points     INT NOT NULL              -- очки за пролаз в рейтинге
);

CREATE TABLE sectors (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    discipline  VARCHAR(20) NOT NULL CHECK (discipline IN ('трудность', 'болдеринг')),
    angle_deg   INT NOT NULL             -- наклон стены, 0 = вертикаль, отрицательный = плита
);

CREATE TABLE routes (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    sector_id   INT NOT NULL REFERENCES sectors(id),
    grade       VARCHAR(4) NOT NULL REFERENCES grades(grade),
    hold_color  VARCHAR(20) NOT NULL,    -- цвет зацепок трассы
    setter      VARCHAR(40) NOT NULL,    -- кто накрутил
    set_date    DATE NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE climbers (
    id     SERIAL PRIMARY KEY,
    name   VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE ascents (
    id          SERIAL PRIMARY KEY,
    climber_id  INT NOT NULL REFERENCES climbers(id),
    route_id    INT NOT NULL REFERENCES routes(id),
    style       VARCHAR(10) NOT NULL CHECK (style IN ('онсайт', 'флэш', 'редпоинт')),
    ascent_date DATE NOT NULL DEFAULT CURRENT_DATE
);

INSERT INTO grades VALUES
 ('5a',1,10),('5b',2,15),('5c',3,20),
 ('6a',4,30),('6a+',5,35),('6b',6,40),('6b+',7,45),('6c',8,55),('6c+',9,60),
 ('7a',10,75),('7a+',11,85),('7b',12,95),('7b+',13,110),('7c',14,125),('7c+',15,140),
 ('8a',16,160);

INSERT INTO sectors (name, discipline, angle_deg) VALUES
 ('Вертикаль',          'трудность',  0),
 ('Нависание 30°',      'трудность', 30),
 ('Плита',              'трудность', -10),
 ('Пещера',             'болдеринг', 45),
 ('Болдер-стенка «Куб»','болдеринг', 15);

INSERT INTO routes (name, sector_id, grade, hold_color, setter, set_date) VALUES
 ('Первый шаг',          1,'5a', 'жёлтый',    'Олег',  CURRENT_DATE - 40),
 ('Разминка',            1,'5b', 'зелёный',   'Аня',   CURRENT_DATE - 35),
 ('Лестница в небо',     1,'5c', 'белый',     'Олег',  CURRENT_DATE - 30),
 ('Мизера',              1,'6b', 'красный',   'Денис', CURRENT_DATE - 12),
 ('Длинная история',     1,'6c', 'синий',     'Аня',   CURRENT_DATE - 6),
 ('Траверс до финиша',   1,'6a+','оранжевый', 'Денис', CURRENT_DATE - 20),
 ('Крыша мира',          2,'6b+','чёрный',    'Денис', CURRENT_DATE - 25),
 ('Выносливость',        2,'7a', 'фиолетовый','Олег',  CURRENT_DATE - 18),
 ('Кислота',             2,'7a+','зелёный',   'Аня',   CURRENT_DATE - 3),
 ('Последний оттяг',     2,'7b', 'красный',   'Денис', CURRENT_DATE - 9),
 ('Банан',               2,'6c+','жёлтый',    'Олег',  CURRENT_DATE - 14),
 ('Проект мечты',        2,'7c', 'белый',     'Денис', CURRENT_DATE - 2),
 ('Трение',              3,'5c', 'синий',     'Аня',   CURRENT_DATE - 28),
 ('Балерина',            3,'6a', 'розовый',   'Аня',   CURRENT_DATE - 16),
 ('Доверься ногам',      3,'6b', 'серый',     'Олег',  CURRENT_DATE - 4),
 ('Мягкая лапа',         4,'5c', 'зелёный',   'Денис', CURRENT_DATE - 22),
 ('Кампус',              4,'6c', 'чёрный',    'Денис', CURRENT_DATE - 11),
 ('Пятка-крюк',          4,'7a', 'красный',   'Аня',   CURRENT_DATE - 7),
 ('Динамо',              4,'6b+','оранжевый', 'Олег',  CURRENT_DATE - 5),
 ('Зверь',               4,'7b+','фиолетовый','Денис', CURRENT_DATE - 1),
 ('Компрессия',          4,'7a+','белый',     'Аня',   CURRENT_DATE - 13),
 ('Слопер-шоу',          5,'6a', 'жёлтый',    'Олег',  CURRENT_DATE - 19),
 ('Координация',         5,'6b', 'синий',     'Аня',   CURRENT_DATE - 8),
 ('Ланч на щипке',       5,'6a+','розовый',   'Денис', CURRENT_DATE - 15),
 ('Боком вверх',         5,'5b', 'зелёный',   'Олег',  CURRENT_DATE - 33),
 ('Хилхук-шоу',          5,'6c+','серый',     'Аня',   CURRENT_DATE - 2),
 ('Олдскул',             5,'6b', 'красный',   'Олег',  CURRENT_DATE - 60);

-- старая трасса, которую уже скрутили
UPDATE routes SET is_active = FALSE WHERE name = 'Олдскул';

INSERT INTO climbers (name) VALUES
 ('Никита'),('Маша'),('Артём'),('Лиза'),('Глеб'),('Катя'),('Саша'),('Вера');

-- Генерим историю пролазов детерминированно: каждый лезет трассы около своего уровня
SELECT setseed(0.42);
WITH lvl(climber, max_order) AS (
    VALUES ('Никита',11),('Маша',9),('Артём',14),('Лиза',6),
           ('Глеб',12),('Катя',8),('Саша',4),('Вера',10)
)
INSERT INTO ascents (climber_id, route_id, style, ascent_date)
SELECT c.id, r.id,
       (ARRAY['онсайт','флэш','редпоинт'])[1 + floor(random()*3)::int],
       GREATEST(r.set_date, CURRENT_DATE - 30) + floor(random()*5)::int
FROM lvl
JOIN climbers c ON c.name = lvl.climber
JOIN routes   r ON TRUE
JOIN grades   g ON g.grade = r.grade
WHERE g.sort_order <= lvl.max_order
  AND random() < 0.55;

-- даты не должны уходить в будущее
UPDATE ascents SET ascent_date = CURRENT_DATE WHERE ascent_date > CURRENT_DATE;
