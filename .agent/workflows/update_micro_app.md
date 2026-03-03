---
description: Update the 'My Private Teacher' micro-app (eduva-live-tutor) and deploy it to the main application.
---
To update the micro-app and see changes in the main EDUVA app, follow these steps:

1.  Navigate to the micro-app directory:
    `cd components/eduva-live-tutor`

2.  Install dependencies (if new ones were added):
    `npm install`

3.  Build the micro-app:
    `npm run build`

4.  Navigate back to the root directory:
    `cd ../..`

5.  Deploy the build artifacts to the public directory:
    // turbo
    `Copy-Item -Path "components/eduva-live-tutor/dist/*" -Destination "public/my-private-teacher" -Recurse -Force`

6.  (Optional) If the dev server is running, just refresh the page.
