# ShowReady: The Live Production Management & System Design Suite

![ShowReady Logo](frontend/public/logo.png)

**Streamline production layouts, automate labeling, track crew hours with precise calculations, and keep your entire team in sync.**

ShowReady is the ultimate workspace designed specifically for live events, theatre, broadcast, and touring professionals. From drag-and-drop rack building and visual wire diagrams to automated timesheet generation and contextual show communication, ShowReady replaces fragmented spreadsheets and ad-hoc drawings with a single, unified source of truth.

---

## 🎨 Interactive Product Overview

Explore the core feature suites that make ShowReady the go-to platform for production design and management.

### 1. Production Design & System Modeling

Translate complex physical setups into interactive digital blueprints.

*   **Drag-and-Drop Rack Builder**: Design and visualize equipment racks in real time. Model fractional-width gear with multi-sided placement (front, rear, left, right).
*   **Modular Chassis & Slots**: Populate equipment templates with slot-specific modules (connector plates, interface cards), tracking custom configurations down to the individual slot level.
*   **Canvas Wire Diagrams**: Lay out your equipment on a multi-page interactive canvas. Connect device ports to build visual signal flow mappings.
*   **Patch Panel Builder**: Create custom patch panels, mount connectors, and visually patch signals between chassis and external panels.

![Rack Builder & Modular Chassis Workspace](https://via.placeholder.com/1200x800.png?text=Rack+Builder+and+Modular+Chassis+Workspace+Screenshot)
*Interactive Drag-and-Drop Rack Builder featuring fractional-width gear and slot assignment.*

---

### 2. Advanced Cable & Case Labeling

Generate high-density, professional production labels directly from your show's database.

*   **Loom Label Editor**: Design multi-layered cable looms with color-coded origin/destination markers, custom cable lengths, and custom descriptions.
*   **Case Label Editor**: Design large-format case labels complete with custom show logos, contact information, and barcodes.
*   **Label Sheet Placement**: Print with zero waste. Digitally place labels on partially used sticker sheets (Avery or custom templates) so you can print single labels without throwing away standard stock sheets.
*   **Loom Builder Sheet Exports**: Automatically compile multiple looms into print-ready, high-resolution PDF lists for quick on-site deployment.

![Loom and Case Label Editors](https://via.placeholder.com/1200x800.png?text=Loom+and+Case+Label+Editors+Screenshot)
*Loom and Case Label Editors showing print-preview sheets and print-stock alignment.*

---

### 3. Labor Operations & Hours Tracking

Manage crew roles, rates, and timesheets in a single, high-efficiency grid interface.

*   **Unified Roster & Show Crew**: Maintain a master labor roster and seamlessly assign crew members to individual shows with role-specific hourly or daily rates.
*   **Flexible Roles**: Assign a single crew member to multiple roles or rate categories on the same show.
*   **Bulk Editable Timesheets**: Track hours in a lightning-fast, spreadsheet-like grid view. Log daily total hours per crew member across a weekly cycle.
*   **Automated Overtime (OT) Engine**: Implements a robust calculation engine:
    *   **Daily & Weekly Overtime**: Automatically flags and bills hours exceeding daily and weekly thresholds.
    *   **Day Rates**: Seamlessly integrates flat Day Rates that cover a base number of hours, absorbing hourly entries up to the threshold, with hours beyond treated as overtime.
    *   **Live Summaries**: Instantly compute and display total regular hours, overtime hours, and combined labor costs.

![Hours Tracking and Timesheet Grid](https://via.placeholder.com/1200x800.png?text=Labor+Timesheet+and+OT+Waterfall+Grid+Screenshot)
*The spreadsheet-style timesheet interface with automatic calculations and live labor cost summaries.*

---

### 4. Network & Infrastructure Management

Document and plan production networks before stepping foot on site.

*   **VLAN Definition Matrix**: Catalog production VLANs with custom IDs, descriptions, and color-coded tags.
*   **IP Allocation Matrix**: Allocate static and dynamic IP pools for production subnets. Associate IPs directly with equipment instances defined in your racks.

![Network and IP Allocation Matrix](https://via.placeholder.com/1200x800.png?text=VLAN+and+IP+Allocation+Workspace+Screenshot)
*Subnet planning grid mapping VLAN IDs, static IP assignments, and equipment rack hosts.*

---

### 5. Communications & Collaboration

Keep production managers, project engineers, and client representatives perfectly aligned.

*   **Rich Text Communications**: Compose professional update emails using a full-featured, rich-text WYSIWYG editor.
*   **Variable Substitution Templates**: Personalize bulk communications using dynamic merge tags (e.g., `{{firstName}}`, `{{showName}}`, `{{weekStart}}`).
*   **Contextual Notes**: Create, edit, and link notes anywhere in the application. Notes can attach globally to a show, or pin directly to specific racks, looms, equipment instances, or roster members.
*   **Show Collaboration & Permissions**: Share shows with specific team members. Collaborate concurrently with granular, role-based feature permissions.

![Communications and Email Composer](https://via.placeholder.com/1200x800.png?text=Tiptap+Communications+Suite+Screenshot)
*Polished email editor with variable substitution sidebar and live recipient preview panels.*

---

## 🛠️ Technology Stack

ShowReady is built on a highly modern, fast, and scalable stack:

*   **Backend Framework**: Python 3.10+ with [FastAPI](https://fastapi.tiangolo.com/) for high-performance API routing.
*   **Frontend UI**: [React](https://react.dev/) built with [Tailwind CSS](https://tailwindcss.com/) for a sleek, responsive, dark-themed interface.
*   **Interactive Canvas**: [React Flow](https://reactflow.dev/) powering custom interactive signal-flow wire diagrams.
*   **Drag-and-Drop Engines**: [@dnd-kit](https://dndkit.com/) for smooth rack slot and chassis placement.
*   **Data & Security**: Secure user access and data storage powered by PostgreSQL and token-based session management.
*   **PDF Generation Engines**: Vector PDF rendering for generating high-precision layouts, timesheet summaries, and labels on the fly.

---

## 🚀 On the Horizon (Roadmap)

We are constantly building more features to expand the platform's capabilities:

*   **Integrated Scheduling Engine**: Shift planners and crew calendars.
*   **Expanded Switch Configuration**: Extended CLI generation and config parsing for network switches.
*   **Visual Label Editor (V3)**: An interactive canvas-based layout editor for custom sticker sheets.
*   **Extended API Integrations**: Secure endpoints for syncing timesheet and scheduling data with popular tools.
*   **Advanced Labor and Equipment Budgeting**: Seamless project-cost calculators and rate sheet sheets.

---

## 🙏 Acknowledgements

ShowReady is made possible by the incredible communities behind FastAPI, React, Tailwind CSS, React Flow, and other open-source libraries.
