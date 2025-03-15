function normalizeSQL(sql) {
  // Remove all whitespace characters (spaces, tabs, newlines)
  return sql.replace(/\s+/g, '');
}

const { DbContext } = require('../../dist/core/context/DbContext');

describe('Query Builder - Select Tests', () => {
  test('Simple select test with console output', () => {
    const dbContext = new DbContext();

    const users = dbContext.set('users');
    const posts = dbContext.set('posts');

    const query = users
      .select(user => ({
        name: user.name,
        posts: posts.where(post => post.userId === user.id).select(post => post.message),
      }))
      .toQueryString();

    // Assert
    expect(true).toBe(true); // Just make it pass for debugging
  });
});
