// Navigation only: never read mailbox contents, tokens, cookies or attachments.
(() => {
  let popup = null;
  window.HarborFlowOutlook = {
    open() {
      try {
        if (popup && !popup.closed) {
          popup.focus();
          return true;
        }
        // Keep the handle for repeat clicks; sever reverse access before navigation.
        popup = window.open('about:blank', 'HarborFlowOutlook', 'popup,width=1200,height=850,resizable=yes,scrollbars=yes');
        if (!popup) {
          window.alert('เปิด Outlook ไม่ได้ กรุณาอนุญาต popup สำหรับ HarborFlow แล้วกดเมนู Outlook อีกครั้ง');
          return false;
        }
        popup.opener = null;
        popup.location.replace('https://outlook.office.com/mail/');
        popup.focus();
        return true;
      } catch {
        popup = null;
        window.alert('เปิด Outlook ไม่ได้ กรุณาตรวจการอนุญาต popup แล้วลองอีกครั้ง หรือเปิด https://outlook.office.com/mail/ โดยตรง');
        return false;
      }
    }
  };
})();
