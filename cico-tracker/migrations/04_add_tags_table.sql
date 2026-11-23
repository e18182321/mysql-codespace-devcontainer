USE cico_tracker;

CREATE TABLE tags (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- DML INSERT seeds the optional tags shown on the food-entry forms.
INSERT INTO tags (name) VALUES
    ('Vegan'), ('Vegetarian'), ('Gluten-Free'), ('Low Carb'), ('Low Fat');

CREATE TABLE food_entries_tags (
    food_entry_id INT UNSIGNED NOT NULL,
    tag_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (food_entry_id, tag_id),
    FOREIGN KEY (food_entry_id) REFERENCES food_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB;
