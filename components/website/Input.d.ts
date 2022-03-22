export type WebsiteInput = {
  path: string;
  domain: string | string[] | undefined;
  certificate: string | undefined;
  security: {
    allowIframe: boolean | undefined;
  };
  redirectToMainDomain: boolean | undefined;
};
