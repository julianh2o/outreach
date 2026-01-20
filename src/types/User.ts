/**
 * Represents a user.
 */
export type User = {
  /**
   * The user's unique identifier
   * @type {string}
   * @memberof User
   * @property id
   * @required
   * @example
   * "5e8d8hg8h8h8q8faf8g8f8f"
   */
  id: string;

  /**
   * The user's first name
   * @type {string}
   * @memberof User
   * @property firstName
   * @required
   * @example
   * "John"
   */
  firstName: string;

  /**
   * The user's last name
   * @type {string}
   * @memberof User
   * @property lastName
   * @required
   * @example
   * "Smith"
   */
  lastName: string;

  /**
   * The user's phone number (E.164 format)
   * @type {string}
   * @memberof User
   * @property phone
   * @required
   * @example
   * "+15551234567"
   */
  phone: string;

  /**
   * The user's email address
   * @type {string}
   * @memberof User
   * @property email
   * @optional
   * @example
   * "john.smith@welcomedeveloper.com"
   */
  email?: string;

  /**
   * The user's created date
   * @type {Date}
   * @memberof User
   * @property createdAt
   * @required
   * @example
   * "2020-01-01T00:00:00.000Z"
   */
  createdAt: Date;

  /**
   * The user's updated date
   * @type {Date}
   * @memberof User
   * @property updatedAt
   * @required
   * @example
   * "2020-01-01T00:00:00.000Z"
   */
  updatedAt: Date;

  /**
   * The user's deleted date
   * @type {Date}
   * @memberof User
   * @property deletedAt
   * @optional
   * @example
   * "2020-01-01T00:00:00.000Z"
   */
  deletedAt?: Date;

  /**
   * The user's status
   * @type {boolean}
   * @memberof User
   * @property status
   * @required
   * @example
   * true
   * @default
   * true
   */
  isActive: boolean;

  /**
   * The user's role
   * @type {boolean}
   * @memberof User
   * @property isAdmin
   * @required
   * @example
   * true
   * @default
   * false
   */
  isAdmin: boolean;

  /**
   * The user's verification status
   * @type {boolean}
   * @memberof User
   * @property isVerified
   * @required
   * @example
   * true
   * @default
   * false
   */
  isVerified: boolean;
};
