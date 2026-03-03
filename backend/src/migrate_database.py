# migrate_database.py
import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv

load_dotenv()

def run_migrations():
    try:
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        
        cursor = conn.cursor()
        
        # Check if users table exists
        cursor.execute("SHOW TABLES LIKE 'users'")
        if cursor.fetchone():
            print("✅ Users table already exists")
        else:
            print("❌ Users table not found - run auth.py initialization")
        
        # Check if websites table has user_id column
        cursor.execute("""
            SELECT COUNT(*) FROM information_schema.COLUMNS 
            WHERE TABLE_NAME = 'websites' AND COLUMN_NAME = 'user_id'
        """)
        if cursor.fetchone()[0] > 0:
            print("✅ Websites table has user_id column")
        else:
            print("❌ Websites table missing user_id column - adding...")
            cursor.execute("ALTER TABLE websites ADD COLUMN user_id INT")
            cursor.execute("ALTER TABLE websites ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL")
            print("✅ Added user_id column to websites")
        
        # Update existing websites with default user (admin)
        cursor.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
        admin_user = cursor.fetchone()
        if admin_user:
            cursor.execute("UPDATE websites SET user_id = %s WHERE user_id IS NULL", (admin_user[0],))
            print(f"✅ Updated existing websites with admin user ID: {admin_user[0]}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ Database migrations completed successfully!")
        
    except Error as e:
        print(f"❌ Migration error: {e}")

if __name__ == "__main__":
    run_migrations()