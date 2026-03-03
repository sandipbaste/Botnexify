#!/usr/bin/env python3
# fix_database.py

import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

def fix_password_resets_table():
    """Fix the password_resets table by adding missing columns"""
    try:
        conn = mysql.connector.connect(
            host=os.getenv('MYSQL_HOST'),
            user=os.getenv('MYSQL_USER'),
            password=os.getenv('MYSQL_PASSWORD'),
            database=os.getenv('MYSQL_DATABASE')
        )
        
        cursor = conn.cursor()
        
        print("🔧 Checking and fixing password_resets table...")
        
        # Check if table exists
        cursor.execute("SHOW TABLES LIKE 'password_resets'")
        if not cursor.fetchone():
            print("❌ password_resets table doesn't exist. Please run the auth initialization first.")
            return
        
        # List of columns to add
        columns_to_add = [
            ('otp', 'VARCHAR(10) DEFAULT NULL'),
            ('verified', 'BOOLEAN DEFAULT FALSE')
        ]
        
        for column_name, column_def in columns_to_add:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_NAME = 'password_resets' AND COLUMN_NAME = '{column_name}'")
                if cursor.fetchone()[0] == 0:
                    print(f"➕ Adding '{column_name}' column...")
                    cursor.execute(f"ALTER TABLE password_resets ADD COLUMN {column_name} {column_def}")
                    
                    # Add index for OTP column
                    if column_name == 'otp':
                        cursor.execute("ALTER TABLE password_resets ADD INDEX idx_otp (otp)")
                    
                    print(f"✅ Added '{column_name}' column")
                else:
                    print(f"✅ '{column_name}' column already exists")
            except Exception as e:
                print(f"⚠️ Error adding '{column_name}' column: {e}")
        
        conn.commit()
        
        # Show table structure
        print("\n📊 Current password_resets table structure:")
        cursor.execute("DESCRIBE password_resets")
        for column in cursor.fetchall():
            print(f"  {column[0]:15} {column[1]:20} {column[2]}")
        
        cursor.close()
        conn.close()
        
        print("\n✅ Database fix completed successfully!")
        
    except Exception as e:
        print(f"❌ Error fixing database: {e}")

if __name__ == "__main__":
    fix_password_resets_table()