from datetime import datetime,timedelta,timezone
from scripts.emergency_gate import needed

def test_emergency_check_does_not_publish_every_five_minutes():
    now=datetime(2026,10,11,18,0,tzinfo=timezone.utc)
    old={'lastChecked':(now-timedelta(minutes=5)).isoformat(),'events':[{'id':'a','status':'active'}]}
    new={**old,'lastChecked':now.isoformat()}
    assert needed(old,new,now) is False
    assert needed(old,new,now+timedelta(minutes=65)) is True
    assert needed(old,{**new,'events':[{'id':'a','status':'ended'}]},now) is True
