"""
Email notification helper for Cloud Run Jobs
使用 SendGrid API 发送邮件通知
"""

import os
import requests
import subprocess
from datetime import datetime
from typing import Dict, List, Optional

def get_sendgrid_api_key() -> Optional[str]:
    """从环境变量或Google Secret Manager获取SendGrid API key"""
    # 首先尝试环境变量 (Cloud Run Job会自动注入)
    api_key = os.environ.get('SENDGRID_API_KEY')
    if api_key:
        return api_key

    # 如果环境变量不存在，尝试从Secret Manager获取 (本地测试用)
    try:
        result = subprocess.run(
            [
                'gcloud', 'secrets', 'versions', 'access', 'latest',
                '--secret=SENDGRID_API_KEY',
                '--project=gen-lang-client-0960644135'
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass

    return None

def send_success_email(
    job_name: str,
    total_companies: int,
    successful_companies: int,
    failed_companies: List[str],
    execution_time_seconds: float
) -> bool:
    """
    发送任务成功完成的邮件通知

    Args:
        job_name: 任务名称 (例如: "FEC Donations Collector")
        total_companies: 总共处理的公司数
        successful_companies: 成功的公司数
        failed_companies: 失败的公司列表 (ticker symbols)
        execution_time_seconds: 执行时间(秒)

    Returns:
        True if email sent successfully, False otherwise
    """
    # 获取SendGrid API Key
    sendgrid_api_key = get_sendgrid_api_key()

    if not sendgrid_api_key:
        print("⚠️  SENDGRID_API_KEY not found, skipping email notification")
        return False

    # 收件人
    recipient_email = "lxu912@gmail.com"
    sender_email = "lxu912@gmail.com"  # 必须使用在SendGrid中已验证的邮箱

    # 格式化执行时间
    minutes = int(execution_time_seconds // 60)
    seconds = int(execution_time_seconds % 60)
    time_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

    # 构建邮件内容
    subject = f"✅ {job_name} - 成功完成 ({successful_companies}/{total_companies} 公司)"

    # HTML body
    failed_list_html = ""
    if failed_companies:
        failed_items = "".join([f"<li>{ticker}</li>" for ticker in failed_companies])
        failed_list_html = f"""
        <h3 style="color: #ff9800;">⚠️ 失败的公司 ({len(failed_companies)})</h3>
        <ul>{failed_items}</ul>
        """

    html_body = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }}
            h2 {{ color: #4CAF50; }}
            .summary {{ background-color: #f5f5f5; padding: 15px; border-radius: 5px; }}
            .summary p {{ margin: 8px 0; }}
            .label {{ font-weight: bold; color: #333; }}
        </style>
    </head>
    <body>
        <h2>✅ {job_name} 数据采集完成</h2>

        <div class="summary">
            <p><span class="label">执行时间:</span> {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
            <p><span class="label">耗时:</span> {time_str}</p>
            <p><span class="label">总公司数:</span> {total_companies}</p>
            <p><span class="label">成功:</span> <span style="color: #4CAF50;">{successful_companies}</span></p>
            <p><span class="label">失败:</span> <span style="color: #f44336;">{len(failed_companies)}</span></p>
        </div>

        {failed_list_html}

        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
        <p style="color: #666; font-size: 12px;">
            This is an automated notification from Stanse Company Ranking System.<br>
            Project: gen-lang-client-0960644135 (Cloud Run) → stanseproject (Firebase)
        </p>
    </body>
    </html>
    """

    # Plain text body (作为备用)
    failed_list_text = ""
    if failed_companies:
        failed_list_text = f"\n\n失败的公司:\n" + "\n".join([f"  - {ticker}" for ticker in failed_companies])

    text_body = f"""
{job_name} 数据采集完成

执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
耗时: {time_str}
总公司数: {total_companies}
成功: {successful_companies}
失败: {len(failed_companies)}
{failed_list_text}

---
This is an automated notification from Stanse Company Ranking System.
Project: gen-lang-client-0960644135 (Cloud Run) → stanseproject (Firebase)
    """

    # SendGrid API payload
    payload = {
        "personalizations": [
            {
                "to": [{"email": recipient_email}],
                "subject": subject
            }
        ],
        "from": {"email": sender_email, "name": "Stanse Data Collection"},
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body}
        ]
    }

    # 发送邮件
    try:
        response = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {sendgrid_api_key}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=10
        )

        if response.status_code == 202:
            print(f"✅ Success email sent to {recipient_email}")
            return True
        else:
            print(f"❌ Failed to send email: {response.status_code} - {response.text}")
            return False

    except Exception as e:
        print(f"❌ Error sending email: {str(e)}")
        return False


# 简化的通知函数 - 使用 print 输出到日志
# Cloud Monitoring 可以配置日志告警
def log_completion_notification(
    job_name: str,
    total_companies: int,
    successful_companies: int,
    failed_companies: List[str],
    execution_time_seconds: float
):
    """
    输出结构化的完成日志，供 Cloud Monitoring 监控和告警
    """
    minutes = int(execution_time_seconds // 60)
    seconds = int(execution_time_seconds % 60)
    time_str = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

    print("\n" + "=" * 70)
    print(f"📊 JOB COMPLETION SUMMARY: {job_name}")
    print("=" * 70)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Execution Time: {time_str}")
    print(f"Total Companies: {total_companies}")
    print(f"Successful: {successful_companies}")
    print(f"Failed: {len(failed_companies)}")

    if failed_companies:
        print(f"\nFailed Companies:")
        for ticker in failed_companies:
            print(f"  - {ticker}")

    print("=" * 70)
    print(f"✅ {job_name} completed successfully")
    print("=" * 70 + "\n")
