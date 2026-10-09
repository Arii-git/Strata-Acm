# Running STRATA on the Web (Cloud Docker)

Since local Docker on Windows is giving you trouble, you have two excellent, **free** paths to run Docker "on the web". 

For a hackathon, **Option 1 (GitHub Codespaces)** is by far the fastest and most reliable, because you get a full VS Code editor in your browser and Docker works out-of-the-box in exactly the same way it would locally.

## Option 1: GitHub Codespaces (Highly Recommended for Hackathons)

GitHub Codespaces gives you a cloud-based development environment with Docker pre-installed. It's literally "Docker on the web".

1. Push your code to a **GitHub repository** (public or private).
2. Go to your repository on GitHub.
3. Click the green **Code** button, switch to the **Codespaces** tab, and click **Create codespace on main**.
4. A full VS Code editor will open in your browser.
5. Wait for the terminal to load at the bottom.
6. Create your `.env` file (with your Gemini API key and Gmail SMTP credentials):
   ```bash
   cp .env.example .env
   # Edit .env with your keys using the web editor
   ```
7. Run the exact same docker-compose command:
   ```bash
   docker compose up --build
   ```
8. **Access the App**: A popup will appear in the bottom right saying "Your application running on port 3000 is available". Click **Open in Browser**. GitHub automatically creates a secure, public web link for your running app!

*Note: You can do the exact same thing using **Gitpod** (gitpod.io/#https://github.com/your-username/strata).*

---

## Option 2: Render.com (For Production/Live Hosting)

If you need a permanent URL to submit for the hackathon judges (and don't just want a dev environment), Render is a free cloud hosting platform that natively supports Docker.

1. Create a free account on [Render.com](https://render.com) and link your GitHub account.
2. In your STRATA repository, create a new file named `render.yaml` in the root directory (I can create this for you if you'd like), containing:

```yaml
services:
  - type: web
    name: strata-engine
    env: docker
    dockerfilePath: services/engine/Dockerfile
    envVars:
      # sync: false = Render asks for the value in its dashboard; secrets never go in this file.
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL
        sync: false
      - key: SMTP_HOST
        value: "smtp.gmail.com"
      - key: SMTP_USER
        sync: false
      - key: SMTP_PASSWORD   # 16-character Google *app password*, not the Gmail login password
        sync: false
    disk:   # persistent disks need a paid Render instance; on the free tier data resets on each deploy
      name: strata-data
      mountPath: /app/data/store
      sizeGB: 1

  - type: web
    name: strata-web
    env: docker
    dockerfilePath: apps/web/Dockerfile
    envVars:
      - key: ENGINE_URL
        # This will be the internal URL Render assigns to the engine
        fromService:
          type: web
          name: strata-engine
          envVarKey: RENDER_INTERNAL_HOSTNAME
```

3. Go to the Render Dashboard, click **New > Blueprint**, and select your repository.
4. Render will automatically read the `render.yaml` file, build both your FastAPI backend and Next.js frontend in the cloud, and provide you with a live `https://...` URL for the judges.

> **Tip**: Render takes about 10 minutes for the first build. Codespaces (Option 1) is instant. Use Codespaces for live development, and Render when you need a permanent link to submit.

