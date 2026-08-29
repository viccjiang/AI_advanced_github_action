const { createApp, ref, computed, onMounted, watch } = Vue;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({
      recipientName: '',
      recipientEmail: '',
      recipientAddress: '',
      shippingMethod: 'home_delivery',
      isRemote: false,
      isUrgent: false
    });
    const errors = ref({});

    // Shipping rules come from the server (src/utils/shipping.js) to avoid duplicated logic
    const shippingMethods = ref([]);
    const freeShippingThreshold = ref(0);
    const remoteAreaSurcharge = ref(0);
    const sameDayUrgentSurcharge = ref(0);
    const quote = ref(null);

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    async function refreshQuote() {
      if (cartItems.value.length === 0) return;
      try {
        const res = await apiFetch('/api/shipping/quote', {
          method: 'POST',
          body: JSON.stringify({
            subtotal: cartTotal.value,
            shippingMethod: form.value.shippingMethod,
            isRemote: form.value.isRemote,
            isUrgent: form.value.isUrgent
          })
        });
        quote.value = res.data;
      } catch (err) {
        quote.value = null;
      }
    }

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立，正在前往付款...', 'success');
        window.location.href = '/ecpay/payment/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    watch(
      function () {
        return [form.value.shippingMethod, form.value.isRemote, form.value.isUrgent, cartTotal.value];
      },
      refreshQuote
    );

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }

      try {
        const optionsRes = await apiFetch('/api/shipping/options');
        shippingMethods.value = optionsRes.data.methods;
        freeShippingThreshold.value = optionsRes.data.freeShippingThreshold;
        remoteAreaSurcharge.value = optionsRes.data.remoteAreaSurcharge;
        sameDayUrgentSurcharge.value = optionsRes.data.sameDayUrgentSurcharge;
        form.value.shippingMethod = optionsRes.data.defaultMethod;
      } catch (e) {
        Notification.show('無法取得配送方式，請稍後再試', 'error');
      }

      await refreshQuote();
      loading.value = false;
    });

    return {
      loading,
      submitting,
      cartItems,
      form,
      errors,
      cartTotal,
      shippingMethods,
      freeShippingThreshold,
      remoteAreaSurcharge,
      sameDayUrgentSurcharge,
      quote,
      submitOrder
    };
  }
}).mount('#app');
