# Royal Transit

Create a high-end, responsive Web Application and Admin PWA for a student transportation service named "وليد وطلعت" (Waleed & Talaat), serving Alexandria to Alamein International University.

Brand & Styling:

Use a clean, modern, luxury aesthetic (dark/light mode friendly with deep navy blue, gold/amber accents, and crisp white). It must feel like an executive shuttle service app.

Role-Based Interfaces & Core Features Needed:

1. Student Dashboard & Booking Interface (Separate Windows):

   - Morning Booking Window: Strictly open between 12:00 PM (previous day) and 7:00 PM. Allows students to select their morning route and departure stop (for 6:00 AM or 8:00 AM buses).

   - Return Booking Window: Strictly open between 6:30 AM (same day) and 10:30 AM. Allows students to reserve early return time slots: 12:30 PM or 1:30 PM.

   - 4:00 PM Return Note & Opt-Out Toggle: Clearly show a note stating that the 4:00 PM bus requires NO booking. Provide a simple one-click button: "I won't use the 4:00 PM bus today" (active until 3:30 PM) for package students returning via private transport.

   - Digital Boarding Pass Screen: Displays a generated QR code representing the student's ID, Name, Photo, Route, Remaining Package Trips Counter (e.g., 45/70), and daily booking status.

   - Daily Pass Request Form (Non-Subscribers): A simple guest form (No login/password required) where daily passengers input Name, WhatsApp Phone Number, Route, and Desired Time Slot. Show pending UI status: "Your daily pass request is pending admin approval."

2. Supervisor / Admin Dashboard (Mobile-First Optimization):

   - QR Code Camera Scanner Page: Live camera scanner popping up a modal showing Student Photo, Name, Route, and Status:

     - 🟢 Status: Booked

     - 🔴 Status: Not Booked

     - 🟡 Status: Scanned Earlier

   - Time-Slot Manifests & Reports: Tabbed sheet views filtering students by departure times (6:00 AM, 8:00 AM, 12:30 PM, 1:30 PM, 4:00 PM) with total passenger counts for bus capacity allocation.

   - Daily Pass Request Management Panel: List of non-subscriber requests with one-click [ Accept ] and [ Reject ] action buttons.

   - Bulk CSV Student Import & Account Generator: An admin tab to upload CSV/Excel files containing student details (Name, WhatsApp Number, Route, Pickup Stop, Subscription Type [Full Term vs 70-Trip Package], Initial Trips Count). Generate a downloadable sheet with auto-generated Usernames and Temporary Passwords.
let the colors of the web app matches with the colors of the logo

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://waleedandtalaat.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8d392838-e1a5-4407-b52d-da25da4f6699).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
