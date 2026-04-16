import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const total = await prisma.match.count();
    console.log(`Total Matches in DB: ${total}`);
    
    // Look for shxde
    const user = await prisma.user.findFirst({ where: { username: 'shxde' } });
    if (user) {
        const matches = await prisma.match.findMany({
            where: {
                OR: [{ player1_id: user.id }, { player2_id: user.id }]
            }
        });
        console.log(`shxde matches: ${matches.length}`);
    } else {
        console.log('shxde not found');
    }
}
main().finally(() => prisma.$disconnect());
