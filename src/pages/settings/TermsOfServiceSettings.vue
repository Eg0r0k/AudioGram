<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.about.termsOfService')" />

      <SettingsGroup>
        <div class="px-4 py-4 space-y-6 text-sm text-foreground leading-relaxed">
          <div>
            <p class="text-xs text-muted-foreground mb-4">
              {{ $t('settings.terms.lastUpdated') }}: {{ lastUpdated }}
            </p>
            <p>{{ $t('settings.terms.intro') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              1. {{ $t('settings.terms.section1Title') }}
            </h2>
            <p>{{ $t('settings.terms.section1Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              2. {{ $t('settings.terms.section2Title') }}
            </h2>
            <p>{{ $t('settings.terms.section2Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              3. {{ $t('settings.terms.section3Title') }}
            </h2>
            <p>{{ $t('settings.terms.section3Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              4. {{ $t('settings.terms.section4Title') }}
            </h2>
            <p>{{ $t('settings.terms.section4Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              5. {{ $t('settings.terms.section5Title') }}
            </h2>
            <p>{{ $t('settings.terms.section5Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              6. {{ $t('settings.terms.section6Title') }}
            </h2>
            <p>{{ $t('settings.terms.section6Body') }}</p>
          </div>

          <div>
            <h2 class="font-semibold text-base mb-2">
              7. {{ $t('settings.terms.section7Title') }}
            </h2>
            <p>{{ $t('settings.terms.section7Body') }}</p>
          </div>

          <div>
            <p class="text-xs text-muted-foreground">
              {{ $t('settings.terms.contact') }}
              <Link
                to="https://github.com/Eg0r0k/AudioGram"
                confirm-external
                class="text-primary cursor-pointer"
              >
                GitHub
              </Link>
            </p>
          </div>
        </div>
      </SettingsGroup>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { Scrollable } from "@/components/ui/scrollable";
import Link from "@/components/ui/link/Link.vue";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";

const lastUpdated = "2026-05-07";
</script>
