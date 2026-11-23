USE cico_tracker;

CREATE TABLE meals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

-- DML INSERT seeds the meal choices, including the N/A fallback at ID 1.
INSERT INTO meals (id, name) VALUES
    (1, 'N/A'), (2, 'Breakfast'), (3, 'Lunch'), (4, 'Dinner'), (5, 'Snack');
