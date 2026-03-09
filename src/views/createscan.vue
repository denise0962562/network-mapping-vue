<script setup>

</script>

<template>

  <div class="flex justify-center">
    <!-- 创建卡片 -->
    <div class="card bg-base-100 card-border m-2.5 border-base-300 w-[85%] p-5">
      <!-- ip -->
      <div class="flex items-center space-x-2 ">
        <span class="input_items_text input_items_required">目标 IP ：</span>
        <div class="flex flex-col w-[75%]">
          <input class="task_input_items" id="create_task_ip" type="text" required placeholder="请输入目标IP或CIDR，多个目标请使用 , 隔开" pattern="^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?(,((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\/([0-9]|[1-2]\d|3[0-2]))?)*$"/>
          <div class="validator-hint ">请输入正确的目标地址</div>
        </div>
      </div>
      <!-- 端口 -->
      <div class="flex items-center space-x-2">
        <span class="input_items_text input_items_required">目标端口：</span>
        <div class="flex flex-col w-[75%]">
          <input class="task_input_items" id="create_task_port" type="text" placeholder="请输入目标端口，留空默认全端口" pattern="^((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?)(,((6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3})(-(6553[0-5]|655[0-2]\d|65[0-4]\d{2}|6[0-4]\d{3}|[1-5]\d{4}|[1-9]\d{0,3}))?))*$">
          <div class="validator-hint ">请输入正确的端口</div>
        </div>
      </div>

      <!-- 优先级 -->
      <div class="flex items-center space-x-2">
        <span class="input_items_text">优先级：</span>
        <div class="w-[75%]">
          <select class="select w-full mt-2.5">
            <option class="selected">立刻</option>
            <option>稍后</option>
            <option>最后</option>
          </select>
        </div>
      </div>


      <!-- 备注 -->
      <div class="flex items-center space-x-2">
        <span class="inline-flex w-[120px] justify-end text-base-content/60 text-sm">备注：</span>
        <textarea class="textarea w-[75%] mt-5" id="create_task_remark" placeholder="备注，最长不超过200个字符" maxlength="200"></textarea>
      </div>

      <!-- 提交操作按钮 -->
      <div class="flex justify-end space-x-2 w-[calc(75%+120px+8px)] mt-4">
        <button class="btn rounded-lg btn-primary" id="task_submit">提交</button>

      </div>

    </div>
    
  </div>
  
</template>