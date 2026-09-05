export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: 'bidder' | 'auctioneer' | 'admin' | 'driver'
          first_name: string | null
          last_name: string | null
          phone: string | null
          is_approved: boolean
          notification_prefs: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'bidder' | 'auctioneer' | 'admin'
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          is_approved?: boolean
          notification_prefs?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'bidder' | 'auctioneer' | 'admin'
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          is_approved?: boolean
          notification_prefs?: Json
          created_at?: string
          updated_at?: string
        }
      }
      auctioneers: {
        Row: {
          id: string
          user_id: string
          company_name: string
          business_license: string | null
          tax_id: string | null
          address_line1: string
          address_line2: string | null
          city: string
          state: string
          zip_code: string
          website: string | null
          logo_url: string | null
          ai_preferences: Json | null
          is_approved: boolean
          approval_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_name: string
          business_license?: string | null
          tax_id?: string | null
          address_line1: string
          address_line2?: string | null
          city: string
          state: string
          zip_code: string
          website?: string | null
          logo_url?: string | null
          ai_preferences?: Json | null
          is_approved?: boolean
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          company_name?: string
          business_license?: string | null
          tax_id?: string | null
          address_line1?: string
          address_line2?: string | null
          city?: string
          state?: string
          zip_code?: string
          website?: string | null
          logo_url?: string | null
          ai_preferences?: Json | null
          is_approved?: boolean
          approval_date?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      auctions: {
        Row: {
          id: string
          auctioneer_id: string
          title: string
          description: string | null
          starts_at: string
          ends_at: string
          status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent: number
          anti_sniping_seconds: number
          terms_and_conditions: string | null
          preview_start: string | null
          preview_end: string | null
          pickup_start: string | null
          pickup_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auctioneer_id: string
          title: string
          description?: string | null
          starts_at: string
          ends_at: string
          status?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent?: number
          anti_sniping_seconds?: number
          terms_and_conditions?: string | null
          preview_start?: string | null
          preview_end?: string | null
          pickup_start?: string | null
          pickup_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auctioneer_id?: string
          title?: string
          description?: string | null
          starts_at?: string
          ends_at?: string
          status?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          buyer_premium_percent?: number
          anti_sniping_seconds?: number
          terms_and_conditions?: string | null
          preview_start?: string | null
          preview_end?: string | null
          pickup_start?: string | null
          pickup_end?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      lots: {
        Row: {
          id: string
          auction_id: string
          lot_number: number
          title: string
          description: string | null
          starting_bid: number
          reserve_price: number | null
          increment: number
          current_high_bid: number
          bid_count: number
          category: string | null
          dimensions: string | null
          condition_report: string | null
          provenance: string | null
          estimate_low: number | null
          estimate_high: number | null
          images: Json
          ai_generated: boolean
          ai_metadata: Json | null
          hype_copy: string | null
          winner_id: string | null
          is_sold: boolean
          hammer_price: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auction_id: string
          lot_number: number
          title: string
          description?: string | null
          starting_bid?: number
          reserve_price?: number | null
          increment?: number
          current_high_bid?: number
          bid_count?: number
          category?: string | null
          dimensions?: string | null
          condition_report?: string | null
          provenance?: string | null
          estimate_low?: number | null
          estimate_high?: number | null
          images?: Json
          ai_generated?: boolean
          ai_metadata?: Json | null
          hype_copy?: string | null
          winner_id?: string | null
          is_sold?: boolean
          hammer_price?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          auction_id?: string
          lot_number?: number
          title?: string
          description?: string | null
          starting_bid?: number
          reserve_price?: number | null
          increment?: number
          current_high_bid?: number
          bid_count?: number
          category?: string | null
          dimensions?: string | null
          condition_report?: string | null
          provenance?: string | null
          estimate_low?: number | null
          estimate_high?: number | null
          images?: Json
          ai_generated?: boolean
          ai_metadata?: Json | null
          hype_copy?: string | null
          winner_id?: string | null
          is_sold?: boolean
          hammer_price?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      bids: {
        Row: {
          id: string
          lot_id: string
          bidder_id: string
          amount: number
          type: 'regular' | 'proxy'
          max_amount: number | null
          is_winning: boolean
          created_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          bidder_id: string
          amount: number
          type?: 'regular' | 'proxy'
          max_amount?: number | null
          is_winning?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          lot_id?: string
          bidder_id?: string
          amount?: number
          type?: 'regular' | 'proxy'
          max_amount?: number | null
          is_winning?: boolean
          created_at?: string
        }
      }
      wallet_ledger: {
        Row: {
          id: string
          user_id: string
          transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount: number
          balance_after: number
          description: string
          reference_id: string | null
          reference_type: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount: number
          balance_after: number
          description: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_type?: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout'
          amount?: number
          balance_after?: number
          description?: string
          reference_id?: string | null
          reference_type?: string | null
          metadata?: Json
          created_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          lot_id: string
          buyer_id: string
          hammer_price: number
          buyer_premium_percent: number
          buyer_premium_amount: number
          total_amount: number
          is_paid: boolean
          paid_at: string | null
          shipping_required: boolean
          is_shipped: boolean
          shipped_at: string | null
          tracking_number: string | null
          shipping_address: Json | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          buyer_id: string
          hammer_price: number
          buyer_premium_percent: number
          buyer_premium_amount: number
          total_amount: number
          is_paid?: boolean
          paid_at?: string | null
          shipping_required?: boolean
          is_shipped?: boolean
          shipped_at?: string | null
          tracking_number?: string | null
          shipping_address?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lot_id?: string
          buyer_id?: string
          hammer_price?: number
          buyer_premium_percent?: number
          buyer_premium_amount?: number
          total_amount?: number
          is_paid?: boolean
          paid_at?: string | null
          shipping_required?: boolean
          is_shipped?: boolean
          shipped_at?: string | null
          tracking_number?: string | null
          shipping_address?: Json | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payment_events: {
        Row: {
          id: string
          event_type: string
          processed: boolean
          payload: Json
          created_at: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          processing_started_at: string | null
        }
        Insert: {
          id: string
          event_type: string
          processed?: boolean
          payload: Json
          created_at?: string
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          processing_started_at?: string | null
        }
        Update: {
          id?: string
          event_type?: string
          processed?: boolean
          payload?: Json
          created_at?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          processing_started_at?: string | null
        }
      }
      payouts_due: {
        Row: {
          id: string
          auctioneer_id: string
          invoice_id: string
          amount: number
          platform_commission: number
          is_paid: boolean
          paid_at: string | null
          payment_reference: string | null
          created_at: string
        }
        Insert: {
          id?: string
          auctioneer_id: string
          invoice_id: string
          amount: number
          platform_commission: number
          is_paid?: boolean
          paid_at?: string | null
          payment_reference?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          auctioneer_id?: string
          invoice_id?: string
          amount?: number
          platform_commission?: number
          is_paid?: boolean
          paid_at?: string | null
          payment_reference?: string | null
          created_at?: string
        }
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          table_name: string
          record_id: string | null
          old_values: Json | null
          new_values: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          table_name: string
          record_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          action?: string
          table_name?: string
          record_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      admin_audit_log: {
        Row: {
          id: string
          admin_id: string
          action: string
          target_type: string
          target_id: string
          before_values: Json | null
          after_values: Json | null
          notes: string | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          action: string
          target_type: string
          target_id: string
          before_values?: Json | null
          after_values?: Json | null
          notes?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          action?: string
          target_type?: string
          target_id?: string
          before_values?: Json | null
          after_values?: Json | null
          notes?: string | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
      system_announcements: {
        Row: {
          id: string
          admin_id: string
          title: string
          message: string
          severity: 'info' | 'warning' | 'urgent'
          target_roles: string[]
          is_active: boolean
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          title: string
          message: string
          severity?: 'info' | 'warning' | 'urgent'
          target_roles?: string[]
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          title?: string
          message?: string
          severity?: 'info' | 'warning' | 'urgent'
          target_roles?: string[]
          is_active?: boolean
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_compliance_flags: {
        Row: {
          id: string
          user_id: string
          flag_type: string
          severity: 'low' | 'medium' | 'high' | 'critical'
          description: string
          flagged_by: string | null
          is_resolved: boolean
          resolved_by: string | null
          resolved_at: string | null
          resolution_notes: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          flag_type: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          description: string
          flagged_by?: string | null
          is_resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          flag_type?: string
          severity?: 'low' | 'medium' | 'high' | 'critical'
          description?: string
          flagged_by?: string | null
          is_resolved?: boolean
          resolved_by?: string | null
          resolved_at?: string | null
          resolution_notes?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      user_documents: {
        Row: {
          id: string
          user_id: string
          document_type: string
          filename: string
          file_url: string
          file_size: number | null
          mime_type: string | null
          verification_status: 'pending' | 'approved' | 'rejected'
          verified_by: string | null
          verified_at: string | null
          verification_notes: string | null
          uploaded_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_type: string
          filename: string
          file_url: string
          file_size?: number | null
          mime_type?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected'
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          uploaded_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_type?: string
          filename?: string
          file_url?: string
          file_size?: number | null
          mime_type?: string | null
          verification_status?: 'pending' | 'approved' | 'rejected'
          verified_by?: string | null
          verified_at?: string | null
          verification_notes?: string | null
          uploaded_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: string
          is_read: boolean
          batch_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type?: string
          is_read?: boolean
          batch_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          message?: string
          type?: string
          is_read?: boolean
          batch_id?: string | null
          created_at?: string
        }
      }
      user_interests: {
        Row: {
          id: string
          user_id: string
          category: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category?: string
          created_at?: string
        }
      }
      user_device_tokens: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string | null
          auth: string | null
          last_used: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh?: string | null
          auth?: string | null
          last_used?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string | null
          auth?: string | null
          last_used?: string
          created_at?: string
        }
      }
      notification_batches: {
        Row: {
          id: string
          admin_id: string | null
          title: string
          message: string
          target_roles: string[]
          severity: 'info' | 'warning' | 'urgent'
          sent_count: number
          created_at: string
        }
        Insert: {
          id?: string
          admin_id?: string | null
          title: string
          message: string
          target_roles?: string[]
          severity?: 'info' | 'warning' | 'urgent'
          sent_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string | null
          title?: string
          message?: string
          target_roles?: string[]
          severity?: 'info' | 'warning' | 'urgent'
          sent_count?: number
          created_at?: string
        }
      }
      feature_flags: {
        Row: {
          id: string
          flag_name: string
          is_enabled: boolean
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          flag_name: string
          is_enabled?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          flag_name?: string
          is_enabled?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      ai_action_prices: {
        Row: {
          action_key: string
          label: string
          description: string | null
          category: 'listing' | 'image'
          credit_cost: number
          is_enabled: boolean
          provider: string | null
          model: string | null
          rate_limit_per_hour: number
          sort_order: number
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          action_key: string
          label: string
          description?: string | null
          category?: 'listing' | 'image'
          credit_cost?: number
          is_enabled?: boolean
          provider?: string | null
          model?: string | null
          rate_limit_per_hour?: number
          sort_order?: number
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          label?: string
          description?: string | null
          category?: 'listing' | 'image'
          credit_cost?: number
          is_enabled?: boolean
          provider?: string | null
          model?: string | null
          rate_limit_per_hour?: number
          sort_order?: number
          updated_by?: string | null
          updated_at?: string
        }
      }
      ai_quick_list_drafts: {
        Row: {
          id: string
          auctioneer_id: string
          created_by: string
          auction_id: string | null
          status: 'capturing' | 'identifying' | 'needs_selection' | 'draft_ready' | 'approved' | 'discarded' | 'blocked' | 'failed'
          capture_mode: 'barcode' | 'photo' | 'manual' | 'hybrid'
          scan_value: string | null
          scan_format: string | null
          manual_context: string | null
          candidates: Json
          selected_candidate_index: number | null
          suggested: Json
          edits: Json
          confidence: number | null
          confidence_reasons: Json
          moderation_status: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result: Json
          suggested_starting_bid: number | null
          suggested_duration_hours: number | null
          lot_id: string | null
          approved_at: string | null
          approved_by: string | null
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auctioneer_id: string
          created_by: string
          auction_id?: string | null
          status?: 'capturing' | 'identifying' | 'needs_selection' | 'draft_ready' | 'approved' | 'discarded' | 'blocked' | 'failed'
          capture_mode?: 'barcode' | 'photo' | 'manual' | 'hybrid'
          scan_value?: string | null
          scan_format?: string | null
          manual_context?: string | null
          candidates?: Json
          selected_candidate_index?: number | null
          suggested?: Json
          edits?: Json
          confidence?: number | null
          confidence_reasons?: Json
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
          suggested_starting_bid?: number | null
          suggested_duration_hours?: number | null
          lot_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          auction_id?: string | null
          status?: 'capturing' | 'identifying' | 'needs_selection' | 'draft_ready' | 'approved' | 'discarded' | 'blocked' | 'failed'
          scan_value?: string | null
          scan_format?: string | null
          manual_context?: string | null
          candidates?: Json
          selected_candidate_index?: number | null
          suggested?: Json
          edits?: Json
          confidence?: number | null
          confidence_reasons?: Json
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
          suggested_starting_bid?: number | null
          suggested_duration_hours?: number | null
          lot_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          error_message?: string | null
          updated_at?: string
        }
      }
      ai_listing_sources: {
        Row: {
          id: string
          draft_id: string
          source_type: 'barcode' | 'isbn' | 'vision' | 'ocr' | 'catalog' | 'manual'
          provider: string
          query: string | null
          matched: boolean
          confidence: number | null
          payload: Json
          latency_ms: number | null
          error: string | null
          fetched_at: string
        }
        Insert: {
          id?: string
          draft_id: string
          source_type: 'barcode' | 'isbn' | 'vision' | 'ocr' | 'catalog' | 'manual'
          provider: string
          query?: string | null
          matched?: boolean
          confidence?: number | null
          payload?: Json
          latency_ms?: number | null
          error?: string | null
          fetched_at?: string
        }
        Update: {
          matched?: boolean
          confidence?: number | null
          payload?: Json
          error?: string | null
        }
      }
      ai_image_jobs: {
        Row: {
          id: string
          auctioneer_id: string
          created_by: string
          draft_id: string | null
          lot_id: string | null
          action_key: string
          variant: 'cleanup' | 'studio' | 'lifestyle'
          status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
          source_image_url: string
          source_image_id: string | null
          prompt: string
          negative_prompt: string | null
          provider: string
          model: string | null
          provider_job_id: string | null
          provider_payload: Json
          moderation_status: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result: Json
          result_image_id: string | null
          idempotency_key: string
          error_message: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          auctioneer_id: string
          created_by: string
          draft_id?: string | null
          lot_id?: string | null
          action_key: string
          variant: 'cleanup' | 'studio' | 'lifestyle'
          status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
          source_image_url: string
          source_image_id?: string | null
          prompt: string
          negative_prompt?: string | null
          provider: string
          model?: string | null
          provider_job_id?: string | null
          provider_payload?: Json
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
          result_image_id?: string | null
          idempotency_key: string
          error_message?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: {
          lot_id?: string | null
          status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
          provider_job_id?: string | null
          provider_payload?: Json
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
          result_image_id?: string | null
          error_message?: string | null
          updated_at?: string
          completed_at?: string | null
        }
      }
      lot_images: {
        Row: {
          id: string
          lot_id: string | null
          draft_id: string | null
          kind: 'original' | 'ai_generated'
          bucket: string
          storage_path: string
          public_url: string
          position: number
          is_primary: boolean
          checksum_sha256: string | null
          byte_size: number | null
          mime_type: string | null
          width: number | null
          height: number | null
          variant: 'cleanup' | 'studio' | 'lifestyle' | null
          source_image_id: string | null
          prompt: string | null
          negative_prompt: string | null
          provider: string | null
          model: string | null
          provider_job_id: string | null
          image_job_id: string | null
          generation_metadata: Json
          disclosure_label: string | null
          moderation_status: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result: Json
          credit_ledger_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lot_id?: string | null
          draft_id?: string | null
          kind: 'original' | 'ai_generated'
          bucket: string
          storage_path: string
          public_url: string
          position?: number
          is_primary?: boolean
          checksum_sha256?: string | null
          byte_size?: number | null
          mime_type?: string | null
          width?: number | null
          height?: number | null
          variant?: 'cleanup' | 'studio' | 'lifestyle' | null
          source_image_id?: string | null
          prompt?: string | null
          negative_prompt?: string | null
          provider?: string | null
          model?: string | null
          provider_job_id?: string | null
          image_job_id?: string | null
          generation_metadata?: Json
          disclosure_label?: string | null
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
          credit_ledger_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          lot_id?: string | null
          position?: number
          is_primary?: boolean
          disclosure_label?: string | null
          moderation_status?: 'pending' | 'passed' | 'flagged' | 'blocked'
          moderation_result?: Json
        }
      }
      ai_credit_ledger: {
        Row: {
          id: string
          user_id: string
          auctioneer_id: string | null
          action_key: string
          credit_cost: number
          status: 'pending' | 'charged' | 'refunded' | 'voided' | 'failed'
          idempotency_key: string
          draft_id: string | null
          lot_id: string | null
          image_job_id: string | null
          provider: string | null
          provider_job_id: string | null
          wallet_ledger_id: string | null
          refund_wallet_ledger_id: string | null
          refunded_at: string | null
          refund_reason: string | null
          failure_reason: string | null
          request_metadata: Json
          result_metadata: Json
          charged_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          auctioneer_id?: string | null
          action_key: string
          credit_cost: number
          status?: 'pending' | 'charged' | 'refunded' | 'voided' | 'failed'
          idempotency_key: string
          draft_id?: string | null
          lot_id?: string | null
          image_job_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          request_metadata?: Json
          result_metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: 'pending' | 'charged' | 'refunded' | 'voided' | 'failed'
          lot_id?: string | null
          provider?: string | null
          provider_job_id?: string | null
          wallet_ledger_id?: string | null
          refund_wallet_ledger_id?: string | null
          refunded_at?: string | null
          refund_reason?: string | null
          failure_reason?: string | null
          result_metadata?: Json
          charged_at?: string | null
          updated_at?: string
        }
      }
      ai_moderation_events: {
        Row: {
          id: string
          subject_type: 'draft' | 'image_job' | 'text'
          subject_id: string | null
          user_id: string | null
          provider: string
          status: 'passed' | 'flagged' | 'blocked'
          categories: Json
          raw: Json
          created_at: string
        }
        Insert: {
          id?: string
          subject_type: 'draft' | 'image_job' | 'text'
          subject_id?: string | null
          user_id?: string | null
          provider: string
          status: 'passed' | 'flagged' | 'blocked'
          categories?: Json
          raw?: Json
          created_at?: string
        }
        Update: {
          status?: 'passed' | 'flagged' | 'blocked'
          categories?: Json
          raw?: Json
        }
      }
      ai_prohibited_terms: {
        Row: {
          id: string
          term: string
          category: string
          severity: 'block' | 'flag'
          is_active: boolean
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          term: string
          category?: string
          severity?: 'block' | 'flag'
          is_active?: boolean
          notes?: string | null
          created_at?: string
        }
        Update: {
          term?: string
          category?: string
          severity?: 'block' | 'flag'
          is_active?: boolean
          notes?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_available_credits: {
        Args: {
          p_user_id: string
        }
        Returns: number
      }
      ai_check_rate_limit: {
        Args: {
          p_user_id: string
          p_action_key: string
          p_max_per_hour: number
        }
        Returns: Json
      }
      ai_begin_action: {
        Args: {
          p_user_id: string
          p_action_key: string
          p_idempotency_key: string
          p_auctioneer_id?: string | null
          p_draft_id?: string | null
          p_lot_id?: string | null
          p_image_job_id?: string | null
          p_request_metadata?: Json
        }
        Returns: Json
      }
      ai_settle_action: {
        Args: {
          p_ledger_id: string
          p_provider?: string | null
          p_provider_job_id?: string | null
          p_result_metadata?: Json
        }
        Returns: Json
      }
      ai_void_action: {
        Args: {
          p_ledger_id: string
          p_reason?: string | null
        }
        Returns: Json
      }
      ai_refund_action: {
        Args: {
          p_ledger_id: string
          p_reason?: string | null
        }
        Returns: Json
      }
      get_wallet_balance: {
        Args: {
          user_uuid: string
        }
        Returns: number
      }
      add_wallet_credits: {
        Args: {
          user_uuid: string
          credit_amount: number
          provider_event_identifier: string
          purchase_description: string
        }
        Returns: boolean
      }
      place_bid: {
        Args: {
          lot_uuid: string
          bidder_uuid: string
          bid_amount: number
          bid_type_param?: 'regular' | 'proxy'
          max_amount_param?: number
        }
        Returns: Json
      }
      process_auction_end: {
        Args: {
          auction_uuid: string
        }
        Returns: Json
      }
      release_escrow_on_shipping: {
        Args: {
          invoice_uuid: string
        }
        Returns: boolean
      }
      get_user_active_bids: {
        Args: {
          user_uuid: string
        }
        Returns: {
          bid_id: string
          lot_id: string
          lot_title: string
          auction_title: string
          bid_amount: number
          is_winning: boolean
          ends_at: string
        }[]
      }
      search_lots: {
        Args: {
          search_query?: string
          category_filter?: string
          min_price?: number
          max_price?: number
          auction_status_filter?: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
        }
        Returns: {
          lot_id: string
          lot_number: number
          title: string
          current_high_bid: number
          auction_title: string
          auction_status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
          ends_at: string
        }[]
      }
      change_user_role: {
        Args: {
          p_admin_id: string
          p_target_user_id: string
          p_new_role: 'bidder' | 'auctioneer' | 'admin'
          p_notes?: string
        }
        Returns: Json
      }
      change_user_status: {
        Args: {
          p_admin_id: string
          p_target_user_id: string
          p_is_approved: boolean
          p_notes?: string
        }
        Returns: Json
      }
      change_auctioneer_status: {
        Args: {
          p_admin_id: string
          p_auctioneer_id: string
          p_is_approved: boolean
          p_notes?: string
        }
        Returns: Json
      }
      get_financial_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      detect_suspicious_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          user_id: string
          email: string
          risk_score: number
          flags: string[]
        }[]
      }
    }
    Enums: {
      user_role: 'bidder' | 'auctioneer' | 'admin'
      auction_status: 'draft' | 'scheduled' | 'live' | 'ended' | 'completed'
      bid_type: 'regular' | 'proxy'
      transaction_type: 'purchase' | 'bid_hold' | 'bid_refund' | 'escrow_hold' | 'escrow_release' | 'payout' | 'ai_spend' | 'ai_refund'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type UserRole = Database['public']['Enums']['user_role']
export type AuctionStatus = Database['public']['Enums']['auction_status']
export type BidType = Database['public']['Enums']['bid_type']
export type TransactionType = Database['public']['Enums']['transaction_type']

export type User = Database['public']['Tables']['users']['Row']
export type Auctioneer = Database['public']['Tables']['auctioneers']['Row']
export type Auction = Database['public']['Tables']['auctions']['Row']
export type Lot = Database['public']['Tables']['lots']['Row']
export type Bid = Database['public']['Tables']['bids']['Row']
export type WalletLedger = Database['public']['Tables']['wallet_ledger']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type PaymentEvent = Database['public']['Tables']['payment_events']['Row']
export type PayoutDue = Database['public']['Tables']['payouts_due']['Row']
export type AuditLog = Database['public']['Tables']['audit_log']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type UserInterest = Database['public']['Tables']['user_interests']['Row']
export type UserDeviceToken = Database['public']['Tables']['user_device_tokens']['Row']
export type NotificationBatch = Database['public']['Tables']['notification_batches']['Row']
export type FeatureFlag = Database['public']['Tables']['feature_flags']['Row']
export type AiActionPriceRow = Database['public']['Tables']['ai_action_prices']['Row']
export type AiQuickListDraftRow = Database['public']['Tables']['ai_quick_list_drafts']['Row']
export type AiListingSource = Database['public']['Tables']['ai_listing_sources']['Row']
export type AiImageJob = Database['public']['Tables']['ai_image_jobs']['Row']
export type LotImage = Database['public']['Tables']['lot_images']['Row']
export type AiCreditLedger = Database['public']['Tables']['ai_credit_ledger']['Row']
export type AiModerationEvent = Database['public']['Tables']['ai_moderation_events']['Row']
export type AiProhibitedTerm = Database['public']['Tables']['ai_prohibited_terms']['Row']
