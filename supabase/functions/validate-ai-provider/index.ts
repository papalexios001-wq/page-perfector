import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AIProvider = 'google' | 'openai' | 'anthropic' | 'groq' | 'openrouter';

interface AIValidationRequest {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

interface AIValidationResponse {
  success: boolean;
  message: string;
  provider: string;
  model: string;
  modelInfo?: {
    id: string;
    name?: string;
    contextWindow?: number;
    pricing?: string;
  };
  error?: string;
  errorCode?: string;
}

const PROVIDER_CONFIGS: Record<AIProvider, { 
  name: string;
  testEndpoint: string;
  modelsEndpoint?: string;
  buildRequest: (apiKey: string, model: string) => { headers: HeadersInit; body?: string };
}> = {
  google: {
    name: 'Google AI',
    testEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    buildRequest: (apiKey, model) => ({
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
    }),
  },
  openai: {
    name: 'OpenAI',
    testEndpoint: 'https://api.openai.com/v1/chat/completions',
    modelsEndpoint: 'https://api.openai.com/v1/models',
    buildRequest: (apiKey, model) => ({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    }),
  },
  anthropic: {
    name: 'Anthropic',
    testEndpoint: 'https://api.anthropic.com/v1/messages',
    buildRequest: (apiKey, model) => ({
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    }),
  },
  groq: {
    name: 'Groq',
    testEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    buildRequest: (apiKey, model) => ({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    }),
  },
  openrouter: {
    name: 'OpenRouter',
    testEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models',
    buildRequest: (apiKey, model) => ({
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://wp-optimizer-pro.lovable.app',
        'X-Title': 'WP Optimizer Pro',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    }),
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, apiKey, model }: AIValidationRequest = await req.json();

    console.log(`[AI Validation] Validating ${provider} with model ${model}`);

    // Validate inputs
    if (!provider || !apiKey || !model) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          provider: provider || 'unknown',
          model: model || 'unknown',
          error: 'Please provide provider, apiKey, and model',
          errorCode: 'MISSING_FIELDS'
        } as AIValidationResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Unsupported AI provider',
          provider,
          model,
          error: `Provider '${provider}' is not supported`,
          errorCode: 'UNSUPPORTED_PROVIDER'
        } as AIValidationResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build test request
    const { headers, body } = config.buildRequest(apiKey, model);
    let testUrl = config.testEndpoint;
    
    // For Google, model is in URL
    if (provider === 'google') {
      testUrl = testUrl.replace('{model}', model);
    }

    console.log(`[AI Validation] Testing endpoint: ${testUrl}`);

    // Make test API call
    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body,
    });

    const responseText = await response.text();
    console.log(`[AI Validation] Response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = 'API validation failed';
      let errorCode = 'API_ERROR';

      try {
        const errorData = JSON.parse(responseText);
        
        if (response.status === 401 || response.status === 403) {
          errorMessage = 'Invalid API key or insufficient permissions';
          errorCode = 'INVALID_API_KEY';
        } else if (response.status === 404) {
          errorMessage = `Model '${model}' not found or not accessible`;
          errorCode = 'MODEL_NOT_FOUND';
        } else if (response.status === 429) {
          errorMessage = 'Rate limited. API key is valid but quota exceeded.';
          errorCode = 'RATE_LIMITED';
        } else {
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        }
      } catch {
        // Use default error message
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: errorMessage,
          provider: config.name,
          model,
          error: errorMessage,
          errorCode
        } as AIValidationResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse successful response
    let modelInfo: AIValidationResponse['modelInfo'] = { id: model };

    try {
      const data = JSON.parse(responseText);
      
      // Extract model info based on provider
      if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
        modelInfo = {
          id: data.model || model,
          name: data.model || model,
        };
      } else if (provider === 'anthropic') {
        modelInfo = {
          id: data.model || model,
          name: data.model || model,
        };
      } else if (provider === 'google') {
        modelInfo = {
          id: model,
          name: model,
        };
      }
    } catch {
      // Use default model info
    }

    console.log(`[AI Validation] Success for ${provider}/${model}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${config.name} API key validated successfully`,
        provider: config.name,
        model,
        modelInfo,
      } as AIValidationResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AI Validation] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Validation failed',
        provider: 'unknown',
        model: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode: 'UNKNOWN_ERROR'
      } as AIValidationResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
