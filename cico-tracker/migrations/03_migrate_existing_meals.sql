USE cico_tracker;

-- Verify that meals.id = 1 is N/A before running this migration.
-- DML UPDATE assigns N/A to existing food entries with no meal.
UPDATE food_entries SET meal_id = 1 WHERE meal_id IS NULL;

ALTER TABLE food_entries
    DROP FOREIGN KEY fk_food_entries_meals;
ALTER TABLE food_entries
    MODIFY COLUMN meal_id INT UNSIGNED NOT NULL DEFAULT 1,
    ADD CONSTRAINT fk_food_entries_meals
        FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE RESTRICT;
