# Puyo Live

A competitive Puyo Puyo style game for the web, featuring real-time multiplayer, leaderboards, and user profiles.

## Project Structure

- **root**: Frontend (Vite + React/TS) and Game Server (Node/Socket.io)
- **api/**: REST API (Express + PostgreSQL)

## Getting Started

1.  Start the database:
    ```bash
    docker compose up -d postgres
    ```
2.  Install dependencies:
    ```bash
    npm install
    cd api && npm install
    ```
3.  Run development servers:
    ```bash
    # Terminal 1: Frontend + Game Server
    npm run dev
    
    # Terminal 2: API
    npm run api
    ```

## License
MIT
