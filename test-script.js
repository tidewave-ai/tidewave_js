/**
 * A simple test function for JavaScript support
 * @param {string} name - The name to greet
 * @returns {string} A greeting message
 */
function greetUser(name) {
  return `Hello, ${name}!`;
}

/**
 * A test class with JSDoc
 */
class TestClass {
  /**
   * Constructor for TestClass
   * @param {number} value - Initial value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * Get the current value
   * @returns {number} The current value
   */
  getValue() {
    return this.value;
  }

  /**
   * Static method to create a new instance
   * @param {number} value - The value to use
   * @returns {TestClass} A new TestClass instance
   */
  static create(value) {
    return new TestClass(value);
  }
}

module.exports = { greetUser, TestClass };
