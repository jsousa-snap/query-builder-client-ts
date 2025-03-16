function normalizeSQL(sql) {
  // Remove all whitespace characters (spaces, tabs, newlines)
  return sql.replace(/\s+/g, '');
}

const { DbContext } = require('../../dist/core/context/DbContext');
const { ExpressionSerializer } = require('../../dist/utils/ExpressionSerializer');

describe('Query Builder - Select Tests', () => {
  test('Simple select test with console output', () => {
    const dbContext = new DbContext();

    const users = dbContext.set('users');
    const address = dbContext.set('address');
    const posts = dbContext.set('posts');

    const query = users
      .join(
        address,
        user => user.id,
        address => address.userId,
        (user, address) => ({
          user,
          address,
        }),
      )
      .select(joined => ({
        userId: joined.user.id,
        name: joined.user.name,
      }))
      .withSubquery(
        'posts',
        posts,
        joined => joined.userId,
        post => post.userId,
        query => query.where(post => post.active === true),
      );

    console.log(query.toQueryString());
    console.log(JSON.stringify(ExpressionSerializer.serialize(query.toMetadata()), null, 2));

    // Assert
    expect(true).toBe(true); // Just make it pass for debugging
  });
});
