'use strict';

const processBackendNotificationRequest = require('@serverless/utils/process-backend-notification-request');
const colors = require('../cli/colors');

module.exports = (notifications, output) => {
  const notification = processBackendNotificationRequest(notifications);
  if (!notification) return;

  output.log();
  output.log(colors.gray(notification.message));
};
