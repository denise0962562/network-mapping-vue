<script setup>
</script>

<template>
  <div class="flex justify-center">
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <div class="grid grid-cols-1 gap-4">
        <label class="form-control w-full">
          <span class="label-text input_items_required">目标 IP</span>
          <input
            class="task_input_items peer"
            id="create_task_ip"
            type="text"
            required
            placeholder="请输入目标 IP 或 CIDR，多个目标请使用 , 隔开"
            pattern="^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?(,((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?)*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的目标地址
          </div>
        </label>

        <label class="form-control w-full">
          <span class="label-text input_items_required">目标端口</span>
          <input
            class="task_input_items peer"
            id="create_task_port"
            type="text"
            placeholder="请输入目标端口，留空默认全端口"
            pattern="^((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?)(,((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?))*$"
          />
          <div class="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-in-out peer-[&:not(:placeholder-shown):invalid]:mt-1 peer-[&:not(:placeholder-shown):invalid]:max-h-10 peer-[&:not(:placeholder-shown):invalid]:opacity-100 text-error text-xs">
            请输入正确的端口
          </div>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1">优先级</span>
          <select class="select w-full">
            <option class="selected">立刻</option>
            <option>稍后</option>
            <option>最后</option>
          </select>
        </label>

        <label class="form-control w-full">
          <span class="label-text mb-1 text-base-content/60">备注</span>
          <textarea
            class="textarea w-full"
            id="create_task_remark"
            placeholder="备注，最长不超过 200 个字符"
            maxlength="200"
          ></textarea>
        </label>
      </div>

      <div class="flex justify-end mt-3">
        <button class="btn rounded-lg btn-neutral w-full md:w-auto" id="task_submit">提交</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task_input_items,
.textarea,
.select {
  text-align: left;
}

.task_input_items::placeholder,
.textarea::placeholder {
  text-align: left;
}
</style>
