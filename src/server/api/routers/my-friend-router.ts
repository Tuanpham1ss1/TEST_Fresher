import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
    NonEmptyStringSchema,
    CountSchema,
    IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
    getById: protectedProcedure
        .input(
            z.object({
                friendUserId: z.number(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            return ctx.db.connection().execute(async (conn) => {
                /**
                 * Question 4: Implement mutual friend count
                 *
                 * Add `mutualFriendCount` to the returned result of this query. You can
                 * either:
                 *  (1) Make a separate query to count the number of mutual friends,
                 *  then combine the result with the result of this query
                 *  (2) BONUS: Use a subquery (hint: take a look at how
                 *  `totalFriendCount` is implemented)
                 *
                 * Instructions:
                 *  - Go to src/server/tests/friendship-request.test.ts, enable the test
                 * scenario for Question 3
                 *  - Run `yarn test` to verify your answer
                 *
                 * Documentation references:
                 *  - https://kysely-org.github.io/kysely/classes/SelectQueryBuilder.html#innerJoin
                 */
                const [friendData, totalFriendCount, mutualFriendData] = await Promise.all([
                    conn
                        .selectFrom('users as friends')
                        .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
                        .where('friendships.userId', '=', ctx.session.userId)
                        .where('friendships.friendUserId', '=', input.friendUserId)
                        .where('friendships.status', '=', 'accepted')
                        .select([
                            'friends.id',
                            'friends.fullName',
                            'friends.phoneNumber',
                        ])
                        .executeTakeFirst(),
                    conn
                        .selectFrom('friendships')
                        .where('userId', '=', input.friendUserId)
                        .where('status', '=', 'accepted')
                        .select((eb) => eb.fn.count('friendUserId').as('totalFriendCount'))
                        .executeTakeFirst(),
                    userTotalFriendCount(conn, ctx.session.userId, input.friendUserId),
                ]);
                if (!friendData) {
                    throw new TRPCError({ code: 'NOT_FOUND' })
                }
                return {
                    ...friendData,
                    totalFriendCount: totalFriendCount?.totalFriendCount ?? 0,
                    mutualFriendCount: mutualFriendData?.mutualFriendCount ?? 0,
                }
            })
        }),
})



const userTotalFriendCount = (db: Database, userId: number, friendUserId: number) => {
    return db
        .selectFrom('friendships as f1')
        .innerJoin('friendships as f2', (join) =>
            join
                .onRef('f1.friendUserId', '=', 'f2.friendUserId')
                .on('f1.userId', '=', userId)
                .on('f2.userId', '=', friendUserId)
        )
        .where('f1.status', '=', 'accepted')
        .where('f2.status', '=', 'accepted')
        .select((eb) => eb.fn.count('f1.friendUserId').as('mutualFriendCount'))
        .executeTakeFirst()
}
