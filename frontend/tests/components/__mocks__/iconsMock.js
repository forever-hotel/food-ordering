/* eslint-disable @typescript-eslint/no-require-imports */
const React = require('react');

module.exports = new Proxy(
  {},
  {
    get: (_, name) => {
      return function MockIcon(props) {
        return React.createElement('span', { ...props, 'data-icon': name, role: 'img' });
      };
    },
  },
);
