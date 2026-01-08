import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WordPressValidationRequest {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

interface WordPressValidationResponse {
  success: boolean;
  message: string;
  siteId?: string;
  siteInfo?: {
    name: string;
    description: string;
    url: string;
    version?: string;
  };
  userInfo?: {
    id: number;
    name: string;
    email: string;
    roles: string[];
    capabilities: string[];
  };
  capabilities?: {
    canEdit: boolean;
    canPublish: boolean;
    canManageOptions: boolean;
  };
  error?: string;
  errorCode?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { siteUrl, username, applicationPassword }: WordPressValidationRequest = await req.json();

    console.log('[WordPress Validation] Starting validation for:', siteUrl);

    // Validate inputs
    if (!siteUrl || !username || !applicationPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Missing required fields',
          error: 'Please provide siteUrl, username, and applicationPassword',
          errorCode: 'MISSING_FIELDS'
        } as WordPressValidationResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize URL
    let normalizedUrl = siteUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, ''); // Remove trailing slashes

    // Create Basic Auth header
    const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword.replace(/\s+/g, '')}`);

    // Step 1: Test basic connectivity with WordPress REST API root
    console.log('[WordPress Validation] Testing API connectivity...');
    const rootResponse = await fetch(`${normalizedUrl}/wp-json/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WP-Optimizer-Pro/1.0',
      },
    });

    if (!rootResponse.ok) {
      console.log('[WordPress Validation] API root not accessible:', rootResponse.status);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'WordPress REST API not accessible',
          error: `Could not reach WordPress REST API. Status: ${rootResponse.status}. Ensure REST API is enabled and accessible.`,
          errorCode: 'API_NOT_ACCESSIBLE'
        } as WordPressValidationResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rootData = await rootResponse.json();
    console.log('[WordPress Validation] API root accessible, site name:', rootData.name);

    // Step 2: Validate authentication by accessing /wp-json/wp/v2/users/me
    console.log('[WordPress Validation] Testing authentication...');
    const userResponse = await fetch(`${normalizedUrl}/wp-json/wp/v2/users/me?context=edit`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
        'User-Agent': 'WP-Optimizer-Pro/1.0',
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.log('[WordPress Validation] Authentication failed:', userResponse.status, errorText);
      
      let errorMessage = 'Authentication failed';
      let errorCode = 'AUTH_FAILED';
      
      if (userResponse.status === 401) {
        errorMessage = 'Invalid username or application password';
        errorCode = 'INVALID_CREDENTIALS';
      } else if (userResponse.status === 403) {
        errorMessage = 'User does not have permission to access the REST API';
        errorCode = 'INSUFFICIENT_PERMISSIONS';
      } else if (userResponse.status === 404) {
        errorMessage = 'WordPress REST API users endpoint not found. Ensure REST API is fully enabled.';
        errorCode = 'ENDPOINT_NOT_FOUND';
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          message: errorMessage,
          error: errorMessage,
          errorCode
        } as WordPressValidationResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = await userResponse.json();
    console.log('[WordPress Validation] User authenticated:', userData.name, 'ID:', userData.id);

    // Step 3: Test post editing capability
    console.log('[WordPress Validation] Testing post capabilities...');
    const postsResponse = await fetch(`${normalizedUrl}/wp-json/wp/v2/posts?per_page=1&context=edit`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader,
        'User-Agent': 'WP-Optimizer-Pro/1.0',
      },
    });

    const canEdit = postsResponse.ok;
    console.log('[WordPress Validation] Can edit posts:', canEdit);

    // Determine capabilities
    const capabilities = userData.capabilities || {};
    const canPublish = capabilities.publish_posts === true || capabilities.edit_published_posts === true;
    const canManageOptions = capabilities.manage_options === true;

    // Save to database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Upsert site in wp_sites table
    const { data: siteData, error: dbError } = await supabase
      .from('wp_sites')
      .upsert({
        site_url: normalizedUrl,
        username: username,
        site_name: rootData.name || 'Unknown',
        site_description: rootData.description || '',
        capabilities: {
          canEdit,
          canPublish,
          canManageOptions,
          userRoles: userData.roles || [],
        },
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'site_url',
      })
      .select()
      .single();

    if (dbError) {
      console.error('[WordPress Validation] Database error:', dbError);
      // Continue even if DB fails - connection validation succeeded
    }

    console.log('[WordPress Validation] Site saved to database:', siteData?.id);

    // Log activity
    if (siteData?.id) {
      await supabase.from('activity_log').insert({
        site_id: siteData.id,
        type: 'success',
        message: `WordPress site connected: ${rootData.name}`,
        details: { url: normalizedUrl, user: userData.name },
      });
    }

    // Build response
    const response: WordPressValidationResponse = {
      success: true,
      message: 'WordPress connection validated successfully',
      siteId: siteData?.id,
      siteInfo: {
        name: rootData.name || 'Unknown',
        description: rootData.description || '',
        url: rootData.url || normalizedUrl,
        version: rootData.version,
      },
      userInfo: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        roles: userData.roles || [],
        capabilities: Object.keys(capabilities).filter(key => capabilities[key] === true).slice(0, 10),
      },
      capabilities: {
        canEdit,
        canPublish,
        canManageOptions,
      }
    };

    console.log('[WordPress Validation] Validation successful');

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[WordPress Validation] Error:', error);
    
    let errorMessage = 'Connection failed';
    let errorCode = 'CONNECTION_ERROR';
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = 'Could not connect to the WordPress site. Please check the URL and ensure the site is accessible.';
      errorCode = 'NETWORK_ERROR';
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode
      } as WordPressValidationResponse),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
