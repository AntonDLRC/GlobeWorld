import os
from flask import Flask, jsonify, render_template
import sqlite3

app = Flask(__name__)

DATABASE = os.path.join(os.path.dirname(__file__), 'database.db')

#This query_db function combines getting the databse, cursor, executing and fetching the results
def query_db(sql, args=(), one=False):
    db = sqlite3.connect(DATABASE)
    cursor = db.cursor()
    cursor.execute(sql, args)
    results = cursor.fetchall()
    db.commit()
    db.close()
    return (results[0] if results else None) if one else results

#home page
@app.route("/")
def home():
    return render_template("home.html")

    



if __name__ == "__main__":
    app.run(debug=True)