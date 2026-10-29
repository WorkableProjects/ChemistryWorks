# Product & Technical Specification: ChemistryWorks

**Project Name:** ChemistryWorks

**Target Audience:** Chemistry Students (Test Takers) & Educators/Admins (Test Creators)

**Architecture:** Serverless / Jamstack (HTML + Netlify Forms + Google Apps Script + Google Sheets)

## 1. Executive Summary & Core Philosophy

**ChemistryWorks** is a lightweight, fluid, and visually inviting chemistry testing platform. It combines the professional aesthetic of academic testing platforms (e.g., Renaissance Learning) with the delightful, engaging micro-interactions of modern form builders (e.g., Tally.so).

### Key Architectural Highlights

* **Zero Database Overhead:** Relies entirely on Netlify Forms and Google Sheets via Google Apps Script (GAS).

* **Automated Identity:** Google Sign-In automatically injects student credentials (`name`, `email`) into every submission payload.

* **Auto-Grading Pipeline:** Client-side execution calculates scores instantly upon submission and syncs questions, student responses, answer keys, and final scores directly to Google Sheets.

* **Admin & Student Views:** Dynamic UI state management allows seamless switching between student testing mode and admin configuration/analytics mode.

## 2. System Architecture & Data Flow

```
[ Student UI / HTML Frontend ]
       │
       ├─ (1) Google Identity Services (Auto-inject Name/Email)
       ├─ (2) Client-Side Auto-Grading Engine (Calculates Score against JSON key)
       │
       ▼
[ Netlify Forms Endpoint ]
       │
       ▼ (Webhook / Forwarding)
[ Google Apps Script (Web App Endpoint) ]
       │
       ▼
[ Google Sheets Database ] ──► (Admin Analytics & Data Viewing)

```

## 3. UI/UX & Design System Guidelines

### 3.1 Visual Aesthetics

* **Palette:** Crisp laboratory theme. Slate gray primary background (`#F8FAFC`), deep cobalt blue primary actions (`#2563EB`), muted emerald accent for correct/success states (`#059669`), and rich charcoal typography (`#0F172A`).

* **Typography:** Clean sans-serif font family (Inter or Plus Jakarta Sans) for high readability across complex chemical formulas.

### 3.2 Animation Engine & Motion Design

Animations must enhance focus without inducing cognitive overload or layout shifts:

* **Question Transitions:** Smooth horizontally sliding cards (`transform: translateX()`, `transition: 280ms cubic-bezier(0.4, 0, 0.2, 1)`) as students advance through questions.

* **Interactive Option Cards:** Subtle scale micro-interactions (`scale(1.01)`) with soft border glow on option selection.

* **Progress Indicator:** Fluid progress bar fills continuously across top of the test viewport.

* **Chemistry Math Rendering:** Latex rendering via KaTeX or MathJax with fade-in opacity transitions once formulas are rendered.

## 4. Feature Specifications

### 4.1 Authentication & Student Identity

* Integration via **Google Identity Services (GIS)** SDK.

* Automated pre-fill of student profile details:

  * Full Name

  * Email Address

  * Profile Avatar (Optional UI display)

* If unauthenticated, test entry is blocked by a friendly "Sign in with Google to Begin" landing screen.

### 4.2 Supported Question Types

1. **Multiple Choice (Single Select):** Custom radio cards.

2. **Multiple Select (Checkboxes):** For multi-variable chemistry problems.

3. **Numeric Answer / Chemical Formula Input:** Short text input with auto-formatting for subscripts/superscripts (e.g., converting `H2O` to $\text{H}_2\text{O}$).

4. **True / False:** Dual large option buttons.

5. **Matching Matrix:** Match reagents to products or elements to oxidation states.

### 4.3 Student Testing View

* **Navigation Header:** Display test title, student info badge, live timer (optional), and progress bar.

* **Test Entry:** Accessible via direct URL slug (`/test?code=CHEM101`) or code entry modal on homepage.

* **Question Focus Mode:** Single-question view or full-page scrolling mode.

* **Instant Submission Modal:** Confirmation screen displaying completion time, total questions answered, and submission status.

### 4.4 Admin Panel & Configuration

* **Access Mode:** Toggle via secret URL parameter (`?admin=true`) or admin access code.

* **Test Creator / JSON Builder:** Simple UI to paste or construct test JSON structures (Questions, Options, Points, Correct Answers).

* **Direct Google Sheet Linkage:** Quick link to access real-time raw data and built-in Google Sheet charts.

## 5. Frontend & Netlify Implementation

### 5.1 Netlify Form Setup (`index.html`)

The HTML page contains a hidden Netlify form configured to post automatically via JavaScript payload or native form submission.

```
<form name="chemistryworks-submissions" method="POST" data-netlify="true" hidden>
  <input type="hidden" name="form-name" value="chemistryworks-submissions" />
  <input type="hidden" name="student_name" />
  <input type="hidden" name="student_email" />
  <input type="hidden" name="test_code" />
  <input type="hidden" name="score_achieved" />
  <input type="hidden" name="score_total" />
  <input type="hidden" name="percentage" />
  <input type="hidden" name="responses_json" />
  <input type="hidden" name="submitted_at" />
</form>

```

## 6. Google Apps Script Backend Specification

Set up a Google Apps Script bound to your target Google Sheet and deploy it as a **Web App** (Access: *Anyone*).

### 6.1 Apps Script Code (`Code.gs`)

```
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // Initialize header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Student Name",
        "Student Email",
        "Test Code",
        "Score Achieved",
        "Total Score",
        "Percentage (%)",
        "Detailed Responses (JSON)"
      ]);
      sheet.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#E2E8F0");
    }

    // Append submission data
    sheet.appendRow([
      new Date(),
      data.student_name,
      data.student_email,
      data.test_code,
      data.score_achieved,
      data.score_total,
      data.percentage + "%",
      JSON.stringify(data.responses)
    ]);

    return ContentService.createTextOutput(JSON.stringify({ "result": "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

```

## 7. Client-Side Auto-Grading & Data Payload Logic

```
// Sample Client-Side Auto-Grading Script
function evaluateAndSubmitTest(testSchema, studentAnswers, studentProfile) {
  let scoreAchieved = 0;
  let scoreTotal = 0;
  let detailedResults = [];

  testSchema.questions.forEach((q) => {
    scoreTotal += q.points;
    const studentAns = studentAnswers[q.id];
    const isCorrect = (JSON.stringify(studentAns) === JSON.stringify(q.correctAnswer));
    
    if (isCorrect) {
      scoreAchieved += q.points;
    }

    detailedResults.push({
      questionId: q.id,
      questionText: q.text,
      givenAnswer: studentAns,
      correctAnswer: q.correctAnswer,
      isCorrect: isCorrect,
      pointsEarned: isCorrect ? q.points : 0
    });
  });

  const percentage = ((scoreAchieved / scoreTotal) * 100).toFixed(2);

  const payload = {
    student_name: studentProfile.name,
    student_email: studentProfile.email,
    test_code: testSchema.code,
    score_achieved: scoreAchieved,
    score_total: scoreTotal,
    percentage: percentage,
    responses: detailedResults
  };

  // Submit to Google Apps Script Web App
  fetch("YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL", {
    method: "POST",
    mode: "no-cors", // Mode for GAS Web App cross-origin requests
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  // Dual-submit to Netlify Forms backup
  submitToNetlifyForms(payload);
}

```

## 8. Deployment & Setup Guide

(MAKE A FILE FOR THIS IN CASE THIS SECTION ITS NOT RIGHT)

To deploy **ChemistryWorks** end-to-end, follow these configuration steps across Google Cloud Platform, Google Apps Script, Netlify, and your source repository.


### 8.1 Step 1: Google Cloud Console Setup (Google Sign-In)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).

2. Create a new project named **ChemistryWorks**.

3. Navigate to **APIs & Services** $\rightarrow$ **OAuth consent screen**:

   * Select **External** (or **Internal** if restricted strictly to your Google Workspace / school domain).

   * Fill in App name (*ChemistryWorks*), User support email, and Developer contact information.

   * Save and finish setup.

4. Navigate to **APIs & Services** $\rightarrow$ **Credentials**:

   * Click **Create Credentials** $\rightarrow$ **OAuth client ID**.

   * Select Application type: **Web application**.

   * Under **Authorized JavaScript origins**, add:

     * `https://<your-site-name>.netlify.app`

     * `http://localhost:3000` (for local development/testing)

   * Under **Authorized redirect URIs**, add the same domain URLs.

5. Copy the generated **Client ID**. Paste this key into your HTML JavaScript snippet (`google.accounts.id.initialize({ client_id: "YOUR_CLIENT_ID" })`).

### 8.2 Step 2: Google Sheets & Apps Script Setup

1. Create a new blank Google Sheet named **ChemistryWorks Submissions**.

2. From the menu bar, open **Extensions** $\rightarrow$ **Apps Script**.

3. Clear the default function and paste the script provided in [Section 6.1](#61-apps-script-code-codegs).

4. Click **Deploy** (top right) $\rightarrow$ **New deployment**.

5. Select type: **Web app**:

   * **Description:** *ChemistryWorks Submission API*

   * **Execute as:** *Me (your email address)*

   * **Who has access:** ***Anyone*** (Critical step: ensures frontend requests succeed without authentication prompt blocks).

6. Click **Deploy**, authorize access permissions when prompted, and copy the resulting **Web App URL**.

7. Embed this **Web App URL** into your JavaScript `fetch` endpoint.

### 8.3 Step 3: Netlify Setup & Deployment

1. **Push Code to GitHub/GitLab:** Put `index.html` in the root directory.

2. **Link to Netlify:**

   * Log into [Netlify](https://app.netlify.com/).

   * Click **Add new site** $\rightarrow$ **Import an existing project**.

   * Connect your Git repository.

3. **Configure Build Settings:**

   * **Build command:** *(Leave blank for plain static HTML)*

   * **Publish directory:** `.` (or leave blank if root)

4. **Enable Netlify Forms:**

   * Netlify automatically detects the hidden `<form name="chemistryworks-submissions" data-netlify="true">` tag in your HTML file upon deployment.

   * Verify detection under **Site Configuration** $\rightarrow$ **Forms** in your Netlify dashboard.

5. **(Optional) Enable Netlify Webhooks:**

   * To automatically trigger Google Apps Script on Netlify Form submission, go to **Site Settings** $\rightarrow$ **Forms** $\rightarrow$ **Form notifications**.

   * Add notification $\rightarrow$ **Outgoing webhook** $\rightarrow$ Paste your Google Apps Script Web App URL.

## 9. Development Roadmap & Deployment Checklist

* \[x\] **Phase 1:** Build standalone static HTML/CSS layout with CSS animations and KaTeX formula support.

* \[x\] **Phase 2:** Integrate Google Sign-In SDK and test credential auto-filling.

* \[x\] **Phase 3:** Construct Client-Side Auto-Grading engine and test JSON schema reader.

* \[x\] **Phase 4:** Create and deploy Google Apps Script endpoint attached to destination Google Sheet.

* \[x\] **Phase 5:** Wire up Netlify Forms auto-forwarding & dual submission pipeline.

* \[ \] **Phase 6:** End-to-end testing (Student login $\rightarrow$ Take test $\rightarrow$ Auto-grade $\rightarrow$ Verify Google Sheet payload).
