
**Storage keys used:**

| Key | Owner | Purpose |
|---|---|---|
| `savedProjectId` / `savedTaskId` / `savedSubtaskId` | PRS | Persisted dropdown selections |
| `prsCalendar` | PRS | Scraped calendar data |
| `workingStatus` | WAVE | Single source of truth for timer state |
| `assignedProject*` / `assignedTask*` / `assignedSubtask*` | WAVE | Live WAVE form selections |
| `shiftStart`, `shiftStop`, `firstBreak*`, `secondBreak*` | WAVE | Schedule config |
| `scheduleState` | WAVE | Once-per-day notification fired flags |

---

## 🚀 Roadmap

The extension is functional today, but there's plenty of room to grow. Below are planned enhancements.

### 📊 Supervisor & Team Lead Dashboard

> **Goal:** Give team leads a bird's-eye view of team attendance and tool usage.

<div align="center">

| Feature | Description |
|---|---|
| 🧑‍💼 **Supervisor Portal** | A web dashboard (or extension page) where supervisors log in with their team code to view real-time status of every employee. |
| 🟢 **Live Attendance** | See who is currently **Working**, on **Break**, or **Offline** — updated every 30 seconds. |
| ⚠️ **Idle Alerts** | Highlight employees who are inside their shift window but have **not started the WAVE timer** for more than 15 minutes. |
| 📉 **Compliance Report** | Daily summary: % of shift time tracked, number of missed days, average break duration. |
| 🔔 **One-Click Nudge** | Supervisors can push a notification directly to a specific employee's browser: *"Please start your timer."* |
| 📤 **CSV Export** | Export attendance and productivity data per team, per week, per month. |
| 🎯 **Team Heatmap** | A calendar-style heatmap showing team-wide productivity per day. |
| 📈 **Leaderboards** | Optional gamified view ranking team members by hours logged and units completed. |

</div>

### 🛠 Other Improvements

- [ ] **Dark mode** for the popup and the productivity panel
- [ ] **Localisation** — support for additional languages
- [ ] **Voice reminders** — optional TTS announcements for shift start/stop
- [ ] **Slack / Teams integration** — push reminders to team channels

---

## 🤝 Contributing

Contributions are welcome! If you have an idea for a feature or spot a bug:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">

### ⚡ Developer. 
This tool was developed by **Collins Mrumba**

**[⬆ Back to Top](#-productivity-assistant)**

<sub>Made with ❤️ for teams that value their time.</sub>

</div>
