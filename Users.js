module.exports = {checkUserAndPassword};

const sql = require('./sql');
const mailer = require('nodemailer');

const userName = process.env.AUTH_USER;
const password = process.env.AUTH_PWD;

const companyEmail = process.env.COMPANY_EMAIL;
const companyEmailPassword = process.env.COMPANY_EMAIL_PASSWORD;


//check username/email and password on database and return true or false.
//TODO: Change username and password check to database
function checkUserAndPassword(inputUser, inputPassword){
    let user = inputUser == userName;
    let pwd = inputPassword == password;
    return (user && pwd);
}

//Check if email or tokens exists, then generate new token and link. send link to specified email.
async function emailResetPassword(email){
    //TODO: Check email in database
    //const userId = await sql.findUser(email);
    //if(!userId) return false;
    //TODO: Create Table for reset token
    //let resetToken = await sql.findToken(userId);
    //if(resetToken) sql.deleteResetToken(userId);
    //resetToken = await crypto.randomBytes(32).toString("hex");
    //const tokenHash = await bcrypt.hash(resetToken, salt);
    //await sql.createToken(userId, tokenHash);
    //const resetLink = `/passwordReset?token=${resetToken}&id=${userId}`;


    let transporter = mailer.createTransport({
        service:'zoho',
        auth:{
            user: companyEmail,
            pass: companyEmailPassword
        }
    });
    var mailOptions = {
        from: companyEmail,
        to: email,
        subject: "Password Reset Request",
        html: ""//build page
    }
}

//Check for existing token, and if token is valid
//Hash password, update password, and delete reset token from database.
async function resetPassword(userId, token, password){
    //let resetToken = await sql.findToken(userId);
    //if(!resetToken) return false;
    //if( !(await bcrypt.compare(token, resetToken)) ) return false;
    //const passwordHash = await bcrypt.hash(password, salt);
    //await sql.updatePassword(userId, password);
    //sql.deleteResetToken(userId);
    //return true;
}