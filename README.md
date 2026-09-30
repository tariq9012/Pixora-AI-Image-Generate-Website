# Pixora AI Studio

Pixora AI — Phase 1: Premium UI/UX Foundation

Build a complete, premium, production-quality frontend UI/UX for an AI image generation SaaS platform called Pixora AI.

IMPORTANT PHASE 1 SCOPE

This is Phase 1 only.

Focus entirely on:

Premium UI/UX

Frontend pages

Responsive layouts

Navigation

Reusable components

Mock/demo data

Interactive frontend states

Professional SaaS experience

DO NOT implement in this phase:

Real AI image generation APIs

Real backend

MySQL/database

JWT authentication

Real payments

Stripe

Cloudinary/S3

Real credit transactions

Real file processing

Real image editing/upscaling/background removal APIs

Use realistic mock data and simulated interactions where necessary.

However, structure the frontend cleanly so that real backend/API functionality can be added in later phases without redesigning the application.

1. TECHNOLOGY

Use:

React

Tailwind CSS

React Router

Modern component-based architecture

Lucide React icons or another clean icon library

Responsive design

Reusable UI components

Do not use unnecessary libraries.

The application should feel like a real premium SaaS product, not a generic dashboard template.

2. BRAND

Product name:

Pixora AI

Main tagline:

Turn your imagination into images.

Secondary positioning:

Create, edit, remix and enhance stunning visuals with AI.

Visual direction:

Dark premium creative SaaS

Modern

Futuristic but elegant

Minimal

High-end

Professional

Strong visual hierarchy

Large typography

Beautiful image previews

Subtle gradients

Soft glow effects

Glassmorphism used carefully

Rounded cards

Smooth hover states

Generous spacing

Avoid making the interface overly neon, childish, or gaming-oriented.

The design should feel comparable to a serious modern AI creative product.

3. GLOBAL DESIGN SYSTEM

Create a consistent design system across the entire application.

Use:

Dark background

Slightly lighter surfaces/cards

High contrast text

Muted secondary text

One premium accent color

Subtle borders

Soft shadows

Rounded corners

Typography should be modern and highly readable.

Create consistent:

Buttons

Inputs

Dropdowns

Tabs

Cards

Modals

Tooltips

Badges

Toasts

Navigation

Empty states

Loading states

Every page must feel like part of the same product.

4. PUBLIC WEBSITE

Create these public pages:

Home / Landing Page

Hero section:

Headline:

Turn your imagination into images.

Subheadline:

Create stunning AI-generated images, edit existing visuals, explore creative ideas, and bring your imagination to life.

Include a prominent prompt composer directly in the hero.

Placeholder:

Describe what you want to create...

Buttons:

Generate Free

Explore Gallery

Show a premium visual showcase around/below the hero.

Include sections:

AI Creation Showcase

Display beautiful AI-generated image cards.

Popular Prompts

Show example prompts users can click.

Examples:

Cinematic futuristic city at sunset

Luxury fashion campaign

Minimal product photography

Fantasy castle in the clouds

Cyberpunk street photography

Modern architectural interior

Featured Creations

Large visual cards with creator information.

Use Cases

Cards for:

Marketing

Social Media

Product Photography

Fashion

Architecture

YouTube

Branding

Concept Art

AI Models

Show model cards:

Pixora Fast

Pixora Pro

Flux

SDXL

These are UI/demo models only in Phase 1.

Features

Highlight:

Text to Image

Image to Image

AI Editing

Image Variations

Background Removal

Upscaling

AI Expand

Reference Images

Pricing Preview

Show:

Free
Creator
Pro
Enterprise

Testimonials

Use realistic mock testimonials.

FAQ

Create a clean accordion FAQ.

Final CTA

Headline:

Your next creation starts with a prompt.

Button:

Start Creating

5. PUBLIC NAVBAR

Create a polished responsive navbar.

Logo:

Pixora AI

Navigation:

Explore

Features

Pricing

Right side:

Log In

Get Started

On mobile use a proper mobile navigation menu.

6. EXPLORE / GALLERY

Create a public AI image discovery page.

Header:

Explore creations

Subtext:

Discover what creators are making with Pixora AI.

Create a beautiful masonry/grid gallery.

Each image card should include:

Image

Creator avatar

Creator username

Prompt preview

Model

Likes

Views

Hover actions:

Like

Save

Remix

Use Prompt

Share

Filters:

Trending

Latest

Popular

Categories:

Portraits

Products

Architecture

Anime

Cinematic

Fashion

3D

Illustration

Include search:

Search creations...

Use realistic mock AI images from appropriate image URLs/placeholders.

7. AUTHENTICATION UI

Create frontend-only authentication pages.

Login

Fields:

Email
Password

Buttons:

Log In

Continue with Google

Links:

Forgot password?
Create account

Sign Up

Fields:

Name
Email
Password
Confirm Password

Button:

Create Account

Google signup option.

Forgot Password

Email input.

Reset Password

New password
Confirm password

These are UI only in Phase 1.

8. MAIN APP LAYOUT

After entering the application, create a professional SaaS dashboard layout.

Desktop:

Left sidebar.

Top header.

Main content area.

Sidebar navigation:

Create

Studio

Image to Image

Editor

Upscale

Remove Background

Expand

Library

My Creations

History

Projects

Favorites

Community

Explore

Account

Profile

Settings

At bottom of sidebar show:

1,250 Credits

and:

Upgrade

Create a collapse/expand sidebar interaction.

Mobile should use a responsive navigation system.

9. AI GENERATOR STUDIO

This is the most important application page.

Route:

/studio

Layout:

Left Control Panel

Section:

Creation Mode

Tabs/buttons:

Generate

Edit

Upscale

Remove Background

Expand

Center Workspace

Large image canvas.

Initially show an elegant empty state:

Icon/visual

Your creation will appear here

Text:

Describe your idea and let Pixora AI bring it to life.

After clicking Generate, simulate a generation process using mock states.

States:

Ready
→ Queued
→ Processing
→ Completed

Do not call a real API.

Prompt Composer

Large input:

Describe your image...

Include:

Prompt enhancement button

Attach image button

Generate button

Generate button should display mock credit cost:

Generate · 8 credits

Controls

Model:

Pixora Fast

Pixora Pro

Flux

SDXL

Aspect Ratio:

1:1

16:9

9:16

4:3

3:4

Resolution:

512

1024

2048

4K

Number of images:

1

2

4

Style:

Photorealistic

Cinematic

Anime

3D

Illustration

Editorial

Minimal

Product Photography

Advanced section:

Negative Prompt

Seed

Guidance

Steps

Make advanced settings collapsible.

10. GENERATED IMAGE RESULT

When mock generation completes, display generated images beautifully.

For 4 images, create a comparison grid.

Each result card should have actions:

Download

Favorite

Edit

Create Variation

Upscale

Save to Project

Share

Include:

Create Variations

button.

Clicking it should simulate a new variation state.

11. IMAGE-TO-IMAGE PAGE

Route:

/image-to-image

Create upload workspace.

Large upload area:

Upload Reference Image

Text:

Drag and drop an image or browse your files

Show preview after mock upload.

Prompt:

Describe how you want to transform this image...

Controls:

Reference Strength

Style Strength

Preserve Face

Preserve Composition

Model

Aspect Ratio

Resolution

Button:

Generate

Use simulated mock generation.

12. AI IMAGE EDITOR

Route:

/editor

Create a professional image editing interface.

Large image canvas.

Toolbar:

AI Edit

Remove Object

Replace Object

Change Background

Change Clothes

Change Lighting

Change Sky

Add Object

Extend Image

Relight

AI edit prompt:

What would you like to change?

Example:

Change the background to a modern Dubai skyline.

Button:

Generate Edit

Show Before / After comparison UI.

Include zoom controls and reset button.

This is UI simulation only.

13. VARIATIONS

Create variation workflow.

After selecting an image:

Title:

Create Variations

Display 4 variation cards.

Each card:

Image

Select button

Favorite

Download

Edit

Include:

Generate 4 Variations

Use mock results.

14. UPSCALER

Route:

/upscale

Create premium upload interface.

Title:

Enhance your image

Upload area.

Options:

2×

4×

8×

Enhancements:

Face Enhancement

Detail Enhancement

Show original vs enhanced preview.

Button:

Enhance Image

UI only.

15. BACKGROUND REMOVER

Route:

/remove-background

Title:

Remove backgrounds instantly

Upload image.

After mock processing show transparent checkerboard preview.

Options:

Transparent

White

Custom Background

AI Generated Background

Buttons:

Remove Background

Download PNG

UI simulation only.

16. AI EXPAND / OUTPAINTING

Route:

/expand

Create interface where image can be expanded.

Controls:

Left

Right

Top

Bottom

Show aspect ratio preview.

Prompt:

Describe what should appear outside the original image...

Button:

Expand Image

Use mock preview.

17. MY CREATIONS

Route:

/creations

Header:

My Creations

Search:

Search your creations...

Tabs:

All

Generated

Edited

Upscaled

Favorites

Shared

Filters:

Date

Model

Project

Type

Display image grid.

Each card includes:

Image

Prompt

Model

Date

Actions

Actions:

Open

Edit

Download

Favorite

Delete

18. GENERATION HISTORY

Route:

/history

Title:

Generation History

Create timeline/list cards.

Each generation should show:

Thumbnail

Prompt

Model

Settings

Date/time

Credits used

Status

Statuses:

Completed
Processing
Failed

Actions:

Regenerate

Edit

Use Prompt

Download

Delete

Include filters.

19. PROJECTS

Route:

/projects

Dashboard with project cards.

Example projects:

Nike Campaign
12 assets

YouTube Thumbnails
24 assets

Restaurant Branding
18 assets

Fashion Collection
36 assets

Button:

Create Project

Project detail page should show:

Project name

Description

Images

Prompts

References

Versions

Allow mock creation/editing of projects.

20. FAVORITES

Create a favorites page containing saved images.

Include:

Search

Filters

Grid layout

Remove from favorites

Open

Remix

Download

21. PROFILE

Route:

/profile

Profile UI:

Avatar

Username

Bio

Generated Images

Followers

Following

Likes

Public Projects

Show public creations.

Include Edit Profile button.

22. SETTINGS

Create settings page with tabs:

Account

Name
Email
Avatar

Appearance

Dark mode

Generation

Default model
Default aspect ratio
Default resolution

Notifications

Email notifications
Generation completion notifications

Privacy

Public profile
Public creations

Use proper switches and controls.

23. CREDITS UI

Create a polished credits experience.

Current balance:

1,250 Credits

Show credit usage card.

Example:

Generation
-8

Upscale
-12

Edit
-10

Show:

Buy Credits

and:

Upgrade Plan

buttons.

This is mock UI only.

24. PRICING PAGE

Route:

/pricing

Create premium pricing page.

Plans:

Free

$0/month

50 credits
Standard generation
Limited resolution
Public creations

Button:

Get Started

Creator

$12/month

1,000 credits
HD generation
Image editing
Private generations
Faster processing

Button:

Choose Creator

Pro

$29/month

3,500 credits
4K
Advanced models
Priority generation
Commercial usage

Button:

Choose Pro

Enterprise

Custom

Team workspace
Higher limits
API access
Priority support

Button:

Contact Sales

Include monthly/yearly toggle visually.

Payment functionality is NOT required in Phase 1.

25. ADMIN DASHBOARD UI

Create a separate admin dashboard.

Route:

/admin

Use a professional analytics dashboard.

Sidebar:

Overview

Users

Generations

Models

Moderation

Payments

Analytics

Reports

Admin Logs

Overview

Stats:

Total Users

Active Users

Images Generated

Images Today

Credits Consumed

Revenue

Failed Generations

API Usage

Use charts with mock data:

Daily Generations

New Users

Revenue

Popular Models

Popular Styles

26. ADMIN USERS

Create users table.

Columns:

User
Email
Plan
Credits
Generations
Status
Joined
Actions

Actions:

View
Suspend
Edit Credits

Use mock data.

27. ADMIN GENERATIONS

Generation jobs table.

Columns:

ID
User
Model
Prompt
Status
Credits
Created
Actions

Statuses:

Queued
Processing
Completed
Failed

28. ADMIN MODERATION

Create moderation dashboard.

Sections:

Reported Images

Reported Users

Prompt Violations

Removed Content

Actions:

Review
Approve
Remove
Suspend

UI only.

29. ADMIN PAYMENTS

Create payment management page.

Show:

Transactions

Subscriptions

Refunds

Credit Purchases

Use mock data.

No real payment integration.

30. ADMIN ANALYTICS

Create detailed analytics page.

Charts:

Daily generations

Weekly generations

Monthly generations

New users

Revenue

Credit consumption

Model popularity

Style popularity

Use realistic mock data.

31. RESPONSIVE DESIGN

This is extremely important.

The application must work properly on:

Desktop

Laptop

Tablet

Mobile

Do not simply shrink desktop layouts.

For mobile:

Responsive sidebar

Mobile navigation

Stacked controls

Responsive image grids

Touch-friendly buttons

Proper prompt composer

Bottom sheets/modals where appropriate

No horizontal overflow.

32. MICRO INTERACTIONS

Add polished but subtle interactions:

Button hover

Card hover

Image hover

Smooth transitions

Dropdown animations

Modal animations

Sidebar transitions

Loading skeletons

Toast notifications

Copy prompt interaction

Favorite animation

Do not over-animate the interface.

33. EMPTY STATES

Every major page should have a polished empty state.

Examples:

No creations yet

Your generated images will appear here.

Button:

Create your first image

Similar empty states for:

Projects

Favorites

History

Shared images

34. LOADING STATES

Create realistic loading states.

For image generation:

Queued

Processing

Generating image

Completed

Use skeleton loaders and progress indicators.

Never leave blank screens during simulated loading.

35. ERROR STATES

Create polished error states.

Example:

Generation failed

Something went wrong while generating your image.

Buttons:

Try Again

Go Back

Also create upload errors and generic application error states.

36. COMPONENT ARCHITECTURE

Create reusable components rather than duplicating UI.

Examples:

Navbar

Sidebar

PromptComposer

ImageCard

ImageGrid

GenerationControls

ModelSelector

AspectRatioSelector

ResolutionSelector

StyleSelector

CreditBadge

ProjectCard

HistoryCard

Modal

Toast

EmptyState

LoadingState

ErrorState

PricingCard

StatsCard

DataTable

ChartCard

Keep the code clean and maintainable.

37. ROUTING

Create proper React routes for all major pages.

Public:

/
/explore
/pricing
/login
/signup
/forgot-password
/reset-password

Application:

/studio
/image-to-image
/editor
/upscale
/remove-background
/expand
/creations
/history
/projects
/favorites
/profile
/settings

Admin:

/admin
/admin/users
/admin/generations
/admin/moderation
/admin/payments
/admin/analytics

38. MOCK DATA

Use realistic mock data throughout Phase 1.

Do not use obviously fake placeholder text like:

"Lorem ipsum"

or:

"Image 1"

Use realistic prompts, usernames, project names, model names and statistics.

The UI should look convincing when opened in a browser.

39. IMAGE QUALITY

The visual identity of Pixora AI depends heavily on imagery.

Use high-quality AI-style image assets/placeholders suitable for:

Portraits

Fashion

Architecture

Products

Landscapes

Fantasy

Cinematic scenes

3D artwork

Avoid low-quality or repetitive images.

40. IMPORTANT UX RULES

The application should always make it obvious:

What the user can do

How much a generation costs

Which model is selected

Which settings are active

Where the generated image is

What action can be taken next

The primary CTA should always be visually clear.

41. DO NOT BUILD YET

Do NOT implement:

Backend

Express server

MySQL

Database schema

JWT

bcrypt

Real authentication

Real AI APIs

OpenAI API

Replicate API

Stability API

Flux API

Cloudinary

S3

Stripe

PayPal

Webhooks

Real credit deduction

Real image processing

These will be implemented in later phases.

42. FINAL QUALITY REQUIREMENT

Do not create a basic template.

Build Pixora AI as if it were a serious premium AI SaaS startup preparing for launch.

Prioritize:

Visual quality + UX + consistency + responsive design + reusable components.

The result should be polished enough to use as a high-end portfolio project.

Before finishing, verify that:

All routes work

Navigation works

Buttons have appropriate interactions

Modals open/close

Tabs work

Filters work visually

Prompt composer works

Mock generation states work

Image cards have working UI actions

Responsive layouts work

No broken links

No console errors

No horizontal overflow

No major UI inconsistencies

Again:

Phase 1 is UI/UX only.

Do not move into backend, database, authentication, payments, or real AI APIs yet.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Database (Phase 2)

Pixora AI uses PostgreSQL via Drizzle ORM. The schema lives in `src/db/schema/`.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a real Postgres
   connection string (a local Postgres, Docker container, or a hosted
   instance like Neon/Supabase all work).
2. Generate SQL migration files from the schema:
   ```sh
   npm run db:generate
   ```
3. Apply migrations to the database:
   ```sh
   npm run db:migrate
   ```
4. (Optional) Seed reference data — subscription plans and AI model
   definitions only, no user accounts:
   ```sh
   npm run db:seed
   ```
5. Browse the database visually:
   ```sh
   npm run db:studio
   ```

`npm run db:push` is also available for quickly syncing the schema straight
to a local/dev database without generating a migration file — useful while
iterating, but prefer `db:generate` + `db:migrate` for anything you intend
to commit, since `db:push` does not leave a reviewable migration behind and
can propose destructive changes on a database with existing data.

`GET /api/health` reports `{ status, service, database, timestamp }` and can
be used as an uptime check once the app is deployed.
