const load = async (type, id, context) => {
  const Component = require(type);

  const component = new Component(id, context);

  await component.init();

  return component;
};

module.exports = load;
