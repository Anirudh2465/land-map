# Land Management System (LMS)
## System Management & Update Guide

This document is a quick manual for maintaining, updating, and troubleshooting the on-premise Land Management System server.

---

### 1. System Summary & Quick Reference

| Item | Details |
| :--- | :--- |
| **Server IP Address** | `172.16.0.15` |
| **Web Application URL** | `http://172.16.0.15:8080` |
| **Default Web Login** | **Email:** `admin@lms.com`<br>**Password:** `Admin@1234` |
| **SSH Username** | `lmwgeo` |
| **Application Directory** | `/home/lmwgeo/LMS` |

---

### 2. Connecting to the Server

From any computer connected to the internal office network (via LAN cable or office Wi-Fi):

1. Open **Terminal** (Mac/Linux) or **Command Prompt / PowerShell** (Windows).
2. Connect using SSH:
   ```bash
   ssh lmwgeo@172.16.0.15
   ```
3. When prompted, enter the password to the server.  
   *(Note: Linux does not show characters or asterisks while typing passwords. Just type it and press **Enter**).*

4. Navigate to the application directory:
   ```bash
   cd ~/LMS
   ```
   *(Alternatively: `cd /home/lmwgeo/LMS`)*

---

### 3. Everyday Operations (Start, Stop, Update)

All management scripts are located inside the `~/LMS` folder.

#### A. Starting the Application
If the application is stopped and you want to start it:
```bash
sudo ./start.sh
```
*Wait a few seconds until the screen prints `LPMS is running!`.*

#### B. Stopping the Application
To temporarily shut down the system for maintenance:
```bash
sudo ./stop.sh
```

#### C. Updating to the Latest Version
When code updates or new features are pushed:
```bash
sudo ./stop.sh
sudo ./update.sh
```
> **Note:** The `update.sh` script automatically downloads the latest changes from GitHub, rebuilds the containers, and starts the system back up. **You do NOT need to run `sudo ./start.sh` after updating.**

#### D. Checking Application Health
To check if all system containers are active and running:
```bash
sudo docker compose ps
```
All services (`lpms_frontend`, `lpms_backend`, `lpms_db`, `lpms_minio`, `lpms_redis`) should show the status as **`Up`** or **`healthy`**.

---

### 4. Customizing the Web Port (`.env`)

Configuration settings are stored in a file named `.env`.

To view or edit the file:
```bash
nano .env
```

#### Setting You Can Change:
- **`APP_PORT=8080`**  
  The web port used to open the website in the browser (`http://172.16.0.15:8080`). Change this only if port `8080` conflicts with another software on the server (e.g., change to `8088` or `80`).

#### How to Save and Exit in `nano`:
1. Press `Ctrl + O` (to save changes).
2. Press `Enter` to confirm.
3. Press `Ctrl + X` (to exit back to the terminal).

#### Applying the Port Change:
Running `update.sh` is **not** required. Simply restart the containers:
```bash
sudo ./stop.sh
sudo ./start.sh
```

---

### 5. Changing the Admin Password

User accounts and passwords are encrypted directly inside the database. Changing `.env` will **not** alter an existing admin password after setup.

To change the admin password at any time, run this single command from `~/LMS` (replace `YourNewPasswordHere` with your desired password):

```bash
sudo docker compose exec backend python -c "from database import SessionLocal; from models import User; from auth.security import get_password_hash; db = SessionLocal(); u = db.query(User).filter(User.email == 'admin@lms.com').first(); u.password_hash = get_password_hash('YourNewPasswordHere'); db.commit(); print('Admin password updated successfully!')"
```

> **Instant Effect:** This change takes effect immediately in the database. You do **not** need to restart or rebuild the server. You can immediately log into the web portal with the new password.

---

### 6. Troubleshooting & FAQ

#### Q1: "The website `http://172.16.0.15:8080` is not loading on my laptop."
1. **Verify your network:** Ensure your laptop is connected to the company office Wi-Fi or LAN cable (not a mobile phone hotspot or guest Wi-Fi).
2. **Check server reachability:** On your laptop, open Command Prompt / Terminal and run:
   ```bash
   ping 172.16.0.15
   ```
   If you receive responses (`Reply from 172.16.0.15...`), the server is reachable.
3. **Verify the server is running:** SSH into the server and run `sudo docker compose ps` to ensure containers are active.
4. **Check the server firewall:** If the server is reachable via ping but the web page won't load, allow port 8080 through the Ubuntu firewall:
   ```bash
   sudo ufw allow 8080/tcp
   ```

---

#### Q2: "I get 'Permission denied' when running a script."
If running `./start.sh` or `./stop.sh` gives a permission error, make sure the scripts have execution permissions:
```bash
chmod +x *.sh
```
Then run the script again with `sudo`.

---

#### Q3: "How can I view real-time logs if something goes wrong?"
To inspect live logs from all services:
```bash
sudo docker compose logs -f
```
To exit the log view, press `Ctrl + C` (this will not stop the application).

---

#### Q4: "What happens if the physical server restarts or loses power?"
The system containers are configured with `restart: unless-stopped`. Once the physical server boots up, all application services will automatically restart on their own. No manual intervention is needed.
