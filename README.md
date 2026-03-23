# UICT — Unserviceable ICT Equipment Database

A web application for managing unserviceable ICT equipment records. Built with Flask (Python) and vanilla HTML/CSS/JS, deployable on Vercel.

## Local Development

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the development server**:
   ```bash
   cd api
   python index.py
   ```
   The app will be available at `http://localhost:5000`

3. **Default admin credentials**:
   - Username: `admin`
   - Password: `admin123`

   > [!NOTE]
   > The app automatically creates a local `uict.db` file (SQLite) and seeds the default admin account on its first run. You don't need to manually create the database.

## Vercel Deployment

1. **Set up a free PostgreSQL database** (e.g., [Neon](https://neon.tech) or [Supabase](https://supabase.com))

2. **Configure environment variables in Vercel**:
   - `DATABASE_URL` — Your PostgreSQL connection string
   - `SECRET_KEY` — A random secret string for session security

3. **Deploy**:
   ```bash
   vercel --prod
   ```

## Features

- 🔐 Admin authentication (login/logout)
- 📦 Full CRUD for equipment records
- 🔍 Search & filter by person, location, brand, serial number
- 📊 Dashboard with statistics overview
- 📄 Report generation (CSV & PDF export)
- 🌙 Modern dark-mode UI with glassmorphism design
