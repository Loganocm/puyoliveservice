import { GameRoom } from './GameRoom.js';

export class RoomManager {
    private rooms: Map<string, GameRoom> = new Map();

    createRoom(): GameRoom {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const room = new GameRoom(roomId);
        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId: string): GameRoom | undefined {
        return this.rooms.get(roomId);
    }

    findRoomByPlayer(playerId: string): GameRoom | undefined {
        for (const room of this.rooms.values()) {
            if (room.players.has(playerId)) {
                return room;
            }
        }
        return undefined;
    }

    deleteRoom(roomId: string) {
        this.rooms.delete(roomId);
    }

    getAllRooms(): GameRoom[] {
        return Array.from(this.rooms.values());
    }
}

export const roomManager = new RoomManager();
