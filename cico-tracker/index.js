// From the project folder, check node --version and npm --version, then run npm install.
// Copy .env.example to .env, set the MariaDB values, and apply the schema and migrations.
// Run npm start to launch this file on port 3000.
const express = require('express');
const mysql2 = require('mysql2/promise');
const expressLayouts = require('express-ejs-layouts');
const dotenv = require('dotenv');

dotenv.config(); // Load the database settings used by the connection pool below.
const app = express();
const port = 4000;

// Make submitted HTML form fields available in req.body and render pages with EJS.
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', './views');
app.set('layout', 'layout');
app.locals.pageTitle = 'Food Entries';
app.use(expressLayouts);

const dbConnection = mysql2.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dateStrings: true,
  port: process.env.DB_PORT
});

function parseFoodEntryDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return null;
  }

  const localDateTime = value.replace(' ', 'T') + (value.length === 16 ? ':00' : '');
  if (localDateTime.slice(0, 4) < '1000') return null;

  // Check the calendar date without applying a time zone to the stored value.
  const iso = `${localDateTime}.000Z`;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) && date.toISOString() === iso
    ? localDateTime.replace('T', ' ')
    : null;
}

function parseFoodEntryInteger(value) {
  if (typeof value !== 'string' || !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    return null;
  }

  const number = Number(value);
  return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647
    ? number
    : null;
}

// CRUD read (DQL). SELECT loads entries, and LIKE filters by the bound search text.
// GROUP BY keeps one row per entry. GROUP_CONCAT collects its tag names for display.
// For a meal summary, GROUP BY meal_id can pair COUNT(*) with SUM(calories).
// The presentation demonstrates that summary query separately from this page.
app.get('/', async (req, res) => {
  const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const sql = `SELECT food_entries.id, dateTime, foodName, calories, servingSize, unit,
      meals.name AS meal, GROUP_CONCAT(tags.name) AS selected_tags
    FROM food_entries
    LEFT JOIN meals ON food_entries.meal_id = meals.id
    LEFT JOIN food_entries_tags ON food_entries_tags.food_entry_id = food_entries.id
    LEFT JOIN tags ON food_entries_tags.tag_id = tags.id
    WHERE food_entries.foodName LIKE ?
    GROUP BY food_entries.id, dateTime, foodName, calories, servingSize, unit, meal`;
  const [rows] = await dbConnection.execute(sql, [`%${searchTerm}%`]);
  res.render('index', { pageTitle: 'Food Entries', foodEntries: rows, searchTerm });
});

// GET renders the form with the meal and tag choices read from MariaDB.
app.get('/food-entry/create', async (req, res) => {
  const [meals] = await dbConnection.execute('SELECT * FROM meals');
  const [tags] = await dbConnection.execute('SELECT * FROM tags');
  res.render('create-food-entry', { pageTitle: 'Add Food Entry', meals, tags });
});

// CRUD create (DML). POST binds form values to INSERT placeholders and saves
// the new entry and its tag links in one transaction.
app.post('/food-entry/create', async (req, res) => {
  const dateTime = parseFoodEntryDateTime(req.body?.dateTime);
  if (!dateTime) return res.status(400).send('Enter a valid date and time.');
  const calories = parseFoodEntryInteger(req.body.calories);
  const servingSize = parseFoodEntryInteger(req.body.servingSize);
  if (calories === null) return res.status(400).send('Enter a valid whole number for Calories.');
  if (servingSize === null) return res.status(400).send('Enter a valid whole number for Serving Size.');

  const connection = await dbConnection.getConnection();
  try {
    await connection.beginTransaction();
    const { foodName, meal, unit } = req.body;
    const [result] = await connection.execute(
      `INSERT INTO food_entries (dateTime, foodName, calories, meal_id, servingSize, unit)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dateTime, foodName, calories, meal || '1', servingSize, unit]
    );
    const tags = new Set(req.body.tags || []);
    for (const tag of tags) {
      await connection.execute(
        'INSERT INTO food_entries_tags (food_entry_id, tag_id) VALUES (?, ?)',
        [result.insertId, tag]
      );
    }
    await connection.commit();
    // After the write, redirect the browser to GET / to read the updated list.
    res.redirect('/');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// CRUD read (DQL). GET binds the route ID to SELECT and renders the populated form.
app.get('/food-entry/:id/edit', async (req, res) => {
  const id = req.params.id;
  const [foodEntries] = await dbConnection.execute('SELECT * FROM food_entries WHERE id = ?', [id]);
  const foodEntry = foodEntries[0];
  if (!foodEntry) return res.sendStatus(404);
  const [foodEntryTags] = await dbConnection.execute(
    'SELECT * FROM food_entries_tags WHERE food_entry_id = ?', [id]
  );
  const [meals] = await dbConnection.execute('SELECT * FROM meals');
  const [tags] = await dbConnection.execute('SELECT * FROM tags');
  res.render('edit-food-entry', {
    pageTitle: 'Edit Food Entry',
    foodEntry,
    meals,
    tags,
    relatedTags: foodEntryTags.map(tag => tag.tag_id)
  });
});

// CRUD update (DML). POST updates the selected entry and replaces its tag links
// in one transaction before redirecting to the list.
app.post('/food-entry/:id/edit', async (req, res) => {
  const dateTime = parseFoodEntryDateTime(req.body?.dateTime);
  if (!dateTime) return res.status(400).send('Enter a valid date and time.');
  const calories = parseFoodEntryInteger(req.body.calories);
  const servingSize = parseFoodEntryInteger(req.body.servingSize);
  if (calories === null) return res.status(400).send('Enter a valid whole number for Calories.');
  if (servingSize === null) return res.status(400).send('Enter a valid whole number for Serving Size.');

  const connection = await dbConnection.getConnection();
  try {
    await connection.beginTransaction();
    const id = req.params.id;
    const { foodName, meal, unit } = req.body;
    await connection.execute(
      `UPDATE food_entries SET dateTime = ?, foodName = ?, calories = ?, meal_id = ?,
       servingSize = ?, unit = ? WHERE id = ?`,
      [dateTime, foodName, calories, meal || '1', servingSize, unit, id]
    );
    await connection.execute('DELETE FROM food_entries_tags WHERE food_entry_id = ?', [id]);
    const tags = new Set(req.body.tags || []);
    for (const tag of tags) {
      await connection.execute(
        'INSERT INTO food_entries_tags (food_entry_id, tag_id) VALUES (?, ?)', [id, tag]
      );
    }
    await connection.commit();
    res.redirect('/');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// GET reads the selected entry and renders the confirmation page.
app.get('/food-entry/:id/delete', async (req, res) => {
  const [rows] = await dbConnection.execute('SELECT * FROM food_entries WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.sendStatus(404);
  res.render('delete-food-entry', { pageTitle: 'Delete Food Entry', foodEntry: rows[0] });
});

// CRUD delete (DML). POST binds the entry ID to DELETE and redirects to the list.
app.post('/food-entry/:id/delete', async (req, res) => {
  await dbConnection.execute('DELETE FROM food_entries WHERE id = ?', [req.params.id]);
  res.redirect('/');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
