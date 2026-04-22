import os
from flask import Flask, jsonify, render_template
import sqlite3

app = Flask(__name__)
DB_PATH = "database.db"

DATABASE = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.route("/")
def home():
    return render_template("home.html")


# --- This is the new route your globe will call ---
# When a user clicks a country, the frontend sends the iso2 code (e.g. "US", "JP")
# and this returns the custom description from your database as JSON.
@app.route("/api/country/<iso2>")
def get_country(iso2):
    conn = get_db()
    row = conn.execute(
        "SELECT description FROM countries WHERE iso2 = ?",
        (iso2.upper(),)
    ).fetchone()
    conn.close()

    if row is None:
        return jsonify({"error": "Country not found"}), 404

    return jsonify({"description": row["description"]})


if __name__ == "__main__":
    app.run(debug=True)
