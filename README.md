# 🏛️ HudumaDesk — Murang'a County Public Service Request System

> A modern, full-stack Mini eCitizen portal built for Murang'a County citizens to submit, track, and manage public service requests.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-blue)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-lightgrey)](https://github.com/WiseLibs/better-sqlite3)

---

## 🌟 Features

### Citizen Portal
- **Registration & Login** — Secure account creation with bcrypt password hashing
- **Submit Requests** — Category, sub-county, ward, location, description + optional photo upload
- **My Dashboard** — View all personal requests with status tracking
- **Status Timeline** — Detailed history of every status change with notes
- **Notifications** — In-app alerts when request status changes

### Admin Dashboard
- **Request Management** — View all requests with multi-filter search (status, category, sub-county, priority)
- **Status Updates** — Move requests through Pending → In Progress → Resolved/Rejected with notes
- **Analytics** — Doughnut + bar charts for status distribution and sub-county breakdown
- **Monthly Trend** — Line chart showing request volume over 6 months
- **Category Breakdown** — Horizontal bar chart of requests by category
- **Sub-County Performance Table** — Resolution rates per sub-county with progress bars
- **Citizens Management** — View registered citizen accounts and their request counts
- **CSV Export** — Download all requests as a spreadsheet

### Public Tracking
- **No Login Required** — Anyone can track a ticket by ID
- **Visual Progress Bar** — Step indicator showing Submitted → In Progress → Resolved
- **Shareable URLs** — `/track?ticket=MRG-2024-0001` for direct links
- **Recent Searches** — Saved locally in browser for quick re-lookup
- **FAQ Section** — Helpful guidance for citizens

### Bonus Features ✨
- **All 7 Murang'a Sub-Counties** — Kiharu, Kigumo, Kandara, Mathioya, Gatanga, Maragwa, Kangema
- **Priority Levels** — Normal, High, Critical (health/safety), Low
- **Ward Field** — More granular location within sub-county
- **Drag & Drop Image Upload** — Drag images onto the upload zone
- **Password Strength Meter** — Visual feedback during registration
- **Dark Mode Design** — Premium glassmorphism UI with animations
- **Mobile Responsive** — Collapsible sidebar, adaptive layouts

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- npm (included with Node.js)

### Installation

```bash
# 1. Navigate to the project folder
cd benardo

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The server starts at **http://localhost:3000**

---

## 🔑 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@muranga.go.ke` | `admin123` |
| **Citizen (Demo)** | `john@example.com` | `citizen123` |

> You can also register your own citizen account at `/register`

---

## 📁 Project Structure

```
benardo/
├── server.js           # Express app + all API routes
├── database.js         # SQLite schema + seed data
├── package.json
├── .env                # Environment variables
├── hudumadesk.db       # SQLite database (auto-created)
├── uploads/            # Uploaded images (auto-created)
├── public/
│   ├── css/
│   │   └── styles.css  # Complete design system (dark mode)
│   └── js/
│       ├── utils.js    # Shared utilities (toast, API, auth guards)
│       ├── citizen.js  # Citizen dashboard logic
│       └── admin.js    # Admin dashboard + Chart.js logic
└── views/
    ├── index.html      # Landing page
    ├── login.html      # Login form
    ├── register.html   # Registration form
    ├── dashboard.html  # Citizen dashboard
    ├── admin.html      # Admin dashboard
    └── track.html      # Public ticket tracking
```

---

## 🗄️ Database Schema

**users** — Stores citizen and admin accounts  
**requests** — Service requests with ticket IDs  
**status_history** — Full audit trail of status changes  
**notifications** — In-app notification system  

---

## 🏛️ Murang'a Sub-Counties Supported

| Sub-County | Description |
|-----------|-------------|
| **Kiharu** | County Headquarters |
| **Kigumo** | Agricultural Heartland |
| **Kandara** | Eastern Hills |
| **Mathioya** | River Valley |
| **Gatanga** | Southern Region |
| **Maragwa** | Tea Country |
| **Kangema** | Highland Sub-County |

---

## 📋 Service Categories

- 💡 Broken Streetlight
- 💧 Water Issue
- 🗑️ Garbage Collection
- 🛣️ Road Damage
- 🚧 Sewer Blockage
- 🏥 Public Health
- 🌿 Environment
- 🚨 Public Safety
- 📋 Other

---

## 🔌 API Endpoints

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| `POST` | `/api/auth/register` | Create account | — |
| `POST` | `/api/auth/login` | Login | — |
| `POST` | `/api/auth/logout` | Logout | — |
| `GET` | `/api/auth/me` | Get session | — |
| `POST` | `/api/requests` | Submit request | Citizen |
| `GET` | `/api/requests/my` | Get own requests | Citizen |
| `GET` | `/api/requests/:id` | Get single request | Auth |
| `GET` | `/api/track/:ticketId` | Public tracking | — |
| `GET` | `/api/admin/requests` | All requests | Admin |
| `PATCH` | `/api/admin/requests/:id/status` | Update status | Admin |
| `GET` | `/api/admin/analytics` | Analytics data | Admin |
| `GET` | `/api/admin/citizens` | Citizen list | Admin |
| `GET` | `/api/admin/export` | CSV export | Admin |
| `GET` | `/api/notifications` | Get notifications | Auth |

---

## 🧪 Testing the Application

1. **Register** a new citizen account at `/register`
2. **Submit** a request — pick a category, sub-county, and describe the issue
3. **Note** the ticket ID shown in the success modal
4. **Track** the ticket at `/track` without logging in
5. **Login** as admin (`admin@muranga.go.ke`) and go to `/admin`
6. **Filter** requests by sub-county, update status, add a note
7. **View Analytics** to see charts and sub-county performance
8. **Export CSV** for a full report

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Web Framework | Express.js 4 |
| Database | SQLite (better-sqlite3) |
| Auth | express-session + connect-sqlite3 |
| Password Hashing | bcryptjs |
| File Upload | multer |
| Charts | Chart.js 4 (CDN) |
| Frontend | Vanilla HTML5 + CSS + JavaScript |
| Fonts | Plus Jakarta Sans (Google Fonts) |

---

## 📝 Documentation & Code Quality

- **Comments** — All major functions and routes are documented inline
- **Error Handling** — Every API route has try/catch with meaningful error responses
- **Security** — Sessions, bcrypt hashing, file type validation, auth middleware
- **Separation of Concerns** — Routes in `server.js`, DB in `database.js`, frontend JS split by role

---

*© 2024 Murang'a County Government — HudumaDesk. Built for citizens, by citizens. 🇰🇪*
