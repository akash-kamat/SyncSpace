import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const { image, messages, roomId } = await req.json()
        const apiKey = Deno.env.get('GEMINI_API_KEY')
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
            throw new Error('Missing environment variables')
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

        // Construct prompt from messages and image
        let promptParts: any[] = [];

        // Add system instruction
        promptParts.push("You are an AI assistant in a collaborative whiteboard app. You have access to the current state of the whiteboard (if provided) and the chat history. Help the users by analyzing the board, answering questions, or suggesting ideas. Be concise and helpful.");

        // Add chat history
        if (messages && Array.isArray(messages)) {
            messages.forEach((msg: any) => {
                promptParts.push(`\n${msg.is_ai ? 'AI' : 'User'}: ${msg.message}`);
            });
        }

        // Add current request
        promptParts.push("\nAI:");

        // Add image if provided
        if (image) {
            const base64Image = image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
            promptParts.push({
                inlineData: {
                    data: base64Image,
                    mimeType: "image/png",
                },
            });
        }

        const result = await model.generateContent(promptParts)
        const response = await result.response
        const text = response.text()

        // Insert AI response into database
        if (roomId) {
            const { error: insertError } = await supabaseAdmin
                .from('ai_chats')
                .insert({
                    room_id: roomId,
                    message: text,
                    is_ai: true
                })

            if (insertError) {
                console.error('Error inserting AI response:', insertError)
                throw insertError
            }
        }

        return new Response(
            JSON.stringify({ analysis: text }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
