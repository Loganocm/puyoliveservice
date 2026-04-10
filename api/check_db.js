import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const user = await prisma.user.findFirst({where: {username: 'shxde'}});
    console.log('User shxde:', user);
    if (user && !user.is_admin) {
        await prisma.user.update({where: {username: 'shxde'}, data: {is_admin: true}});
        console.log('Updated shxde to be admin');
    }
}
main().finally(() => prisma.$disconnect());
