type EndpointType = 'openai' | 'anthropic';

interface ResolveAIEndpointInput {
  providerType: EndpointType;
  baseUrl: string;
  anthropicBaseUrl?: string;
  modelEndpointType?: EndpointType;
}

function resolveAIEndpoint(input: ResolveAIEndpointInput): {
  endpointType: EndpointType;
  baseUrl: string;
} {
  const endpointType = input.modelEndpointType || input.providerType;
  return {
    endpointType,
    baseUrl:
      endpointType === 'anthropic' && input.anthropicBaseUrl
        ? input.anthropicBaseUrl
        : input.baseUrl,
  };
}

module.exports = {
  resolveAIEndpoint,
};
