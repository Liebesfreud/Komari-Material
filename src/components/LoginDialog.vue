<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { ApiError, getSharedApi } from '@/utils/api'
import { reconnectAfterLogin } from '@/utils/init'
import '@material/web/button/filled-button.js'
import '@material/web/button/outlined-button.js'
import '@material/web/button/text-button.js'
import '@material/web/textfield/outlined-text-field.js'

const props = defineProps<{
  forceLogin?: boolean
}>()

const emit = defineEmits<{
  loginSuccess: []
}>()

const appStore = useAppStore()
const api = getSharedApi()

const form = ref({
  username: '',
  password: '',
})

const loading = ref(false)
const showOtpDialog = ref(false)
const otpCode = ref<string[]>(['', '', '', '', '', ''])
const otpLoading = ref(false)

function updateUsername(event: Event) {
  form.value.username = (event.target as HTMLInputElement).value
}

function updatePassword(event: Event) {
  form.value.password = (event.target as HTMLInputElement).value
}

function updateOtp(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1)
  otpCode.value[index] = value
}

function validateForm(): boolean {
  if (!form.value.username.trim()) {
    window.$message?.warning('请输入用户名')
    return false
  }
  if (!form.value.password) {
    window.$message?.warning('请输入密码')
    return false
  }
  return true
}

async function finishLogin() {
  window.$message?.success('登录成功')

  if (props.forceLogin) {
    emit('loginSuccess')
  }
  else {
    await reconnectAfterLogin()
    window.$modal?.destroyAll()
  }
}

async function handleLogin() {
  if (!validateForm())
    return

  loading.value = true

  try {
    await api.login(form.value.username, form.value.password)
    await finishLogin()
  }
  catch (error) {
    if (error instanceof ApiError) {
      const msg = error.message.toLowerCase()
      if (msg.includes('2fa') || msg.includes('2fa code') || msg.includes('two factor')) {
        showOtpDialog.value = true
        return
      }
    }
    console.error('[LoginDialog] Login error:', error)
    window.$message?.error('登录失败，请检查用户名和密码')
  }
  finally {
    loading.value = false
  }
}

async function handleOtpSubmit() {
  const code = otpCode.value.join('')
  if (code.length < 6) {
    window.$message?.warning('请输入 6 位验证码')
    return
  }

  otpLoading.value = true

  try {
    await api.login(form.value.username, form.value.password, code)
    await finishLogin()
  }
  catch (error) {
    console.error('[LoginDialog] OTP error:', error)
    window.$message?.error('验证码错误，请重试')
    otpCode.value = ['', '', '', '', '', '']
  }
  finally {
    otpLoading.value = false
  }
}

function handleOAuth2Login() {
  location.href = '/api/oauth'
}
</script>

<template>
  <div class="login-dialog">
    <div v-if="!showOtpDialog" class="login-dialog__form">
      <label class="md-form-field">
        <span class="md-form-label">用户名</span>
        <md-outlined-text-field
          class="md-text-field"
          type="text"
          autocomplete="username"
          placeholder="请输入用户名"
          :value="form.username"
          :disabled="loading"
          @input="updateUsername"
          @keydown.enter="handleLogin"
        />
      </label>

      <label class="md-form-field">
        <span class="md-form-label">密码</span>
        <md-outlined-text-field
          class="md-text-field"
          type="password"
          autocomplete="current-password"
          placeholder="请输入密码"
          :value="form.password"
          :disabled="loading"
          @input="updatePassword"
          @keydown.enter="handleLogin"
        />
      </label>

      <md-filled-button class="login-dialog__primary" :disabled="loading" @click="handleLogin">
        <span class="material-symbols-rounded login-dialog__button-icon" aria-hidden="true">login</span>
        <span>{{ loading ? '登录中...' : '登录' }}</span>
      </md-filled-button>

      <template v-if="appStore.publicSettings?.oauth_enable">
        <div class="login-dialog__divider" />
        <md-outlined-button class="login-dialog__primary" @click="handleOAuth2Login">
          <span class="material-symbols-rounded login-dialog__button-icon" aria-hidden="true">open_in_new</span>
          <span>使用 OAuth2 登录</span>
        </md-outlined-button>
      </template>
    </div>

    <div v-else class="login-dialog__otp">
      <div class="login-dialog__otp-copy">
        <h3>两步验证</h3>
        <p>请输入验证器中的 6 位数字验证码</p>
      </div>

      <div class="login-dialog__otp-inputs" aria-label="两步验证码">
        <input
          v-for="(_, index) in otpCode"
          :key="index"
          class="login-dialog__otp-input"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          :value="otpCode[index]"
          :disabled="otpLoading"
          @input="updateOtp(index, $event)"
          @keydown.enter="handleOtpSubmit"
        >
      </div>

      <div class="login-dialog__otp-actions">
        <md-text-button :disabled="otpLoading" @click="showOtpDialog = false">
          返回
        </md-text-button>
        <md-filled-button :disabled="otpLoading" @click="handleOtpSubmit">
          {{ otpLoading ? '验证中...' : '验证' }}
        </md-filled-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-dialog {
  width: 100%;
}

.login-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-dialog__primary {
  width: 100%;
}

.login-dialog__button-icon {
  margin-inline-end: 8px;
  font-size: 18px;
  vertical-align: -4px;
}

.login-dialog__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--md-sys-color-outline-variant);
}

.login-dialog__otp {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}

.login-dialog__otp-copy {
  text-align: center;

  h3 {
    margin: 0 0 6px;
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  }

  p {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-body-medium-font);
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  }
}

.login-dialog__otp-inputs {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(6, minmax(34px, 1fr));
  gap: 8px;
}

.login-dialog__otp-input {
  width: 100%;
  height: 48px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 4px;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  line-height: var(--md-sys-typescale-title-large-line-height);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  text-align: center;

  &:focus {
    border-color: var(--md-sys-color-primary);
    outline: 2px solid color-mix(in srgb, var(--md-sys-color-primary) 24%, transparent);
    outline-offset: 1px;
  }
}

.login-dialog__otp-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 8px;
}
</style>
