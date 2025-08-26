/**
 * A sample function for testing
 * @param {string} name - The user's name
 * @returns {string} A greeting message
 */
function greetUser(name) {
  return `Hello, ${name}!`;
}

/**
 * A sample class for testing
 */
class TestClass {
  /**
   * Constructor
   * @param {number} value - Initial value
   */
  constructor(value) {
    this.value = value;
  }

  /**
   * Get the value
   * @returns {number} The current value
   */
  getValue() {
    return this.value;
  }

  /**
   * Static factory method
   * @param {number} value - The value
   * @returns {TestClass} New instance
   */
  static create(value) {
    return new TestClass(value);
  }
}

module.exports = { greetUser, TestClass };
