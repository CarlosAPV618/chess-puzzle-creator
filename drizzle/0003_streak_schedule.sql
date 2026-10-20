-- D2: box becomes the streak of clean solves (0..3). least(old box, trailing clean run, 3) never
-- overstates the real streak; due_at counts from the last attempt.
with t as (
  select e.id, e.box,
    (select max(a.created_at) from exercise_attempts a where a.exercise_id = e.id) as last,
    -- clean solves since the last result that was not one
    (select count(*) from exercise_attempts a
      where a.exercise_id = e.id and a.first_try_correct and not a.used_hint and not a.viewed_solution
        and a.created_at > coalesce((select max(b.created_at) from exercise_attempts b
              where b.exercise_id = e.id
                and not (b.first_try_correct and not b.used_hint and not b.viewed_solution)), '-infinity')
    )::int as run
  from exercises e)
update exercises e set
  box = least(t.box, t.run, 3),
  due_at = case least(t.box, t.run, 3)
    when 0 then now()
    when 1 then t.last + interval '60 days'
    when 2 then t.last + interval '180 days'
    else greatest(e.due_at, t.last + interval '180 days') end
from t
where t.id = e.id;
