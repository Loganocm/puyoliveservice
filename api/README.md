# Puyo Live API

REST API for Puyo Live, handling user accounts, match history, ELO ratings, and leaderboards.

## Features

- **User Authentication**: Secure registration and login with bcrypt password hashing and JWT tokens
- **Match History**: Track all game results with detailed statistics
- **ELO Rating System**: Automatic rating calculations after each ranked match
- **Leaderboard**: Global rankings and player statistics

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+

### Development Setup

1. **Copy environment file**:

   ```bash
   cp .env.example .env
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start PostgreSQL** (or use Docker):

   ```bash
   ```bash
   docker run -d --name puyolive-postgres \
     -e POSTGRES_USER=puyolive \
     -e POSTGRES_PASSWORD=puyolive_secret \
     -e POSTGRES_DB=puyolive \
     -p 5432:5432 \
     postgres:16-alpine
   ```

4. **Run migrations**:

   ```bash
   npm run db:migrate
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001`.

### Docker Setup

Use Docker Compose from the root project directory:

```bash
docker-compose up -d
```

This starts PostgreSQL, the API, game server, and client.

## API Endpoints

### Authentication

| Method | Endpoint                    | Description              |
| ------ | --------------------------- | ------------------------ |
| POST   | `/api/auth/register`        | Register a new user      |
| POST   | `/api/auth/login`           | Login and get JWT token  |
| GET    | `/api/auth/me`              | Get current user profile |
| POST   | `/api/auth/change-password` | Change password          |
| POST   | `/api/auth/verify`          | Verify a JWT token       |

### Users

| Method | Endpoint               | Description                  |
| ------ | ---------------------- | ---------------------------- |
| GET    | `/api/users/:id`       | Get user profile by ID       |
| GET    | `/api/users/:username` | Get user profile by username |

### Matches

| Method | Endpoint                    | Description                           |
| ------ | --------------------------- | ------------------------------------- |
| POST   | `/api/matches`              | Record a match result (requires auth) |
| GET    | `/api/matches/:id`          | Get match details                     |
| GET    | `/api/matches/user/:userId` | Get user's match history              |
| GET    | `/api/matches/recent/all`   | Get recent matches globally           |

### Leaderboard

| Method | Endpoint                          | Description                             |
| ------ | --------------------------------- | --------------------------------------- |
| GET    | `/api/leaderboard`                | Get top players                         |
| GET    | `/api/leaderboard/stats`          | Get global statistics                   |
| GET    | `/api/leaderboard/rank/:userId`   | Get user's rank                         |
| GET    | `/api/leaderboard/around/:userId` | Get players around a user               |
| GET    | `/api/leaderboard/me`             | Get current user's rank (requires auth) |

### Health

| Method | Endpoint  | Description      |
| ------ | --------- | ---------------- |
| GET    | `/health` | API health check |

## Authentication

Include the JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

## Example Requests

### Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "player1", "password": "SecurePass123"}'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "player1", "password": "SecurePass123"}'
```

### Get Leaderboard

```bash
curl http://localhost:3001/api/leaderboard?limit=10
```

## ELO System

The API uses a standard ELO rating system:

- **Default Rating**: 1000
- **K-Factor**: 32 (for faster rating changes)
- **Minimum Rating**: 100 (floor to prevent negative ratings)

### Formula

```
Expected Score = 1 / (1 + 10^((OpponentELO - PlayerELO) / 400))
New Rating = Old Rating + K * (Actual Score - Expected Score)
```

Upsets (lower-rated player winning) result in larger ELO swings.

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Database Schema

### Users Table

| Column             | Type         | Description                 |
| ------------------ | ------------ | --------------------------- |
| id                 | SERIAL       | Primary key                 |
| username           | VARCHAR(32)  | Unique username             |
| password_hash      | VARCHAR(255) | Bcrypt hashed password      |
| email              | VARCHAR(255) | Optional email              |
| elo_rating         | INTEGER      | Current ELO (default: 1000) |
| games_played       | INTEGER      | Total games played          |
| games_won          | INTEGER      | Total games won             |
| games_lost         | INTEGER      | Total games lost            |
| highest_chain      | INTEGER      | Personal best chain         |
| total_garbage_sent | INTEGER      | Lifetime garbage sent       |
| created_at         | TIMESTAMP    | Account creation date       |

### Matches Table

| Column                   | Type      | Description             |
| ------------------------ | --------- | ----------------------- |
| id                       | SERIAL    | Primary key             |
| player1_id               | INTEGER   | First player's user ID  |
| player2_id               | INTEGER   | Second player's user ID |
| winner_id                | INTEGER   | Winner's user ID        |
| player1_elo_before/after | INTEGER   | ELO snapshots           |
| elo_change               | INTEGER   | Absolute ELO change     |
| duration_seconds         | INTEGER   | Match duration          |
| player1/2_max_chain      | INTEGER   | Highest chain achieved  |
| player1/2_garbage_sent   | INTEGER   | Total garbage sent      |
| ended_at                 | TIMESTAMP | Match end time          |

## Environment Variables

| Variable       | Default               | Description         |
| -------------- | --------------------- | ------------------- |
| PORT           | 3001                  | API port            |
| NODE_ENV       | development           | Environment mode    |
| DB_HOST        | localhost             | PostgreSQL host     |
| DB_PORT        | 5432                  | PostgreSQL port     |
| DB_NAME        | puyolive              | Database name       |
| DB_USER        | puyolive              | Database user       |
| DB_PASSWORD    | puyolive_secret       | Database password   |
| JWT_SECRET     | (required)            | JWT signing secret  |
| JWT_EXPIRES_IN | 7d                    | Token expiration    |
| CORS_ORIGIN    | http://localhost:5173 | Allowed CORS origin |

## Future Improvements

- [ ] Email verification
- [ ] Password reset via email
- [ ] OAuth (Discord, Google)
- [ ] Seasonal rankings
- [ ] Match replay storage
- [ ] Achievement system
- [ ] Player profiles with customization
- [ ] Friend system
- [ ] Rate limiting
- [ ] API versioning
